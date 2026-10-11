import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type Check = { id: string; description: string; executable: string; args: string[]; cwd: string; timeoutMs: number };
export type CheckResult = { id: string; status: 'passed' | 'failed' | 'denied' | 'timeout' | 'tooling_failure' | 'cancelled'; exitCode: number | null; durationMs: number; stdout: string; stderr: string; truncated: boolean };
export type Approval = (check: Check) => Promise<boolean>;

export function discoverScripts(root: string): Record<string, string> {
  const file = path.join(root, 'package.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> };
  return data.scripts ?? {};
}

export function createCheckRegistry(sampleRoot: string): Check[] {
  const root = fs.realpathSync(sampleRoot);
  const scripts = discoverScripts(root);
  const checks: Check[] = [];
  if (scripts.test === 'node --import tsx --test src/lib/services/session.test.ts') checks.push({
    id: 'auth-unit', description: 'Run the reviewed authentication session unit tests', executable: process.execPath,
    args: ['--import', 'tsx', '--test', 'src/lib/services/session.test.ts'], cwd: root, timeoutMs: 20_000,
  });
  if (scripts.check === 'tsc --noEmit') checks.push({
    id: 'typecheck', description: 'Run the reviewed TypeScript type check', executable: process.execPath,
    args: [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--incremental', 'false'], cwd: root, timeoutMs: 30_000,
  });
  return checks;
}

export function sanitizeOutput(raw: string, root: string, limit = 4000): { text: string; truncated: boolean } {
  let text = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  text = text.replaceAll(root, '<sample-root>').replaceAll(root.replaceAll('\\', '/'), '<sample-root>');
  text = text.replace(/(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}/g, '<redacted-key>');
  text = text.replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, '$1<redacted>');
  text = text.replace(/([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*[:=]\s*)\S+/g, '$1<redacted>');
  return { text: text.slice(0, limit), truncated: text.length > limit };
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false });
    killer.on('error', () => {});
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

function sourceFingerprint(root: string): string {
  const hash = createHash('sha256');
  function visit(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.next', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) { hash.update(path.relative(root, file)); hash.update(fs.readFileSync(file)); }
    }
  }
  visit(root);
  return hash.digest('hex');
}

export async function executeCheck(sampleRoot: string, registry: Check[], id: string, approve: Approval, signal?: AbortSignal): Promise<CheckResult> {
  const root = fs.realpathSync(sampleRoot);
  const check = registry.find(item => item.id === id);
  if (!check) throw new Error('Unknown verification check');
  if (fs.realpathSync(check.cwd) !== root || !path.isAbsolute(check.executable) || !Array.isArray(check.args)) throw new Error('Check is outside trusted sample root or invalid');
  if (signal?.aborted) return { id, status: 'cancelled', exitCode: null, durationMs: 0, stdout: '', stderr: '', truncated: false };
  if (!(await approve(check))) return { id, status: signal?.aborted ? 'cancelled' : 'denied', exitCode: null, durationMs: 0, stdout: '', stderr: '', truncated: false };
  if (signal?.aborted) return { id, status: 'cancelled', exitCode: null, durationMs: 0, stdout: '', stderr: '', truncated: false };
  const start = Date.now();
  const before = sourceFingerprint(root);
  return await new Promise(resolve => {
    let stdout = ''; let stderr = ''; let truncated = false; let timedOut = false; let cancelled = false; let done = false;
    const env: NodeJS.ProcessEnv = { ...process.env, OPENROUTER_API_KEY: '', NEATLOGS_API_KEY: '' };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(check.executable, check.args, { cwd: check.cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32', env });
    const capture = (value: Buffer, channel: 'stdout' | 'stderr') => {
      const next = channel === 'stdout' ? stdout + value.toString() : stderr + value.toString();
      if (channel === 'stdout') stdout = next.slice(0, 8000); else stderr = next.slice(0, 8000);
      if (next.length > 8000) truncated = true;
    };
    child.stdout?.on('data', (data: Buffer) => capture(data, 'stdout'));
    child.stderr?.on('data', (data: Buffer) => capture(data, 'stderr'));
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, check.timeoutMs);
    const onAbort = () => { cancelled = true; killTree(child.pid); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const finish = (status: CheckResult['status'], code: number | null) => {
      if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      const changed = sourceFingerprint(root) !== before;
      const out = sanitizeOutput(stdout, root); const err = sanitizeOutput(stderr + (changed ? '\nSource files changed during verification.' : ''), root);
      resolve({ id, status: changed ? 'tooling_failure' : cancelled ? 'cancelled' : status, exitCode: code, durationMs: Date.now() - start, stdout: out.text, stderr: err.text, truncated: truncated || out.truncated || err.truncated });
    };
    child.on('error', () => finish('tooling_failure', null));
    child.on('close', code => finish(timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed', code));
  });
}
