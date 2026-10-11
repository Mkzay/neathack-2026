import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function git(root: string, args: string[]): void {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false, timeout: 10_000, windowsHide: true });
  if (result.status !== 0) throw new Error(`Scenario Git setup failed: ${String(result.stderr).slice(0, 200)}`);
}

export function prepareAuthRegression(sourceRoot: string): string {
  const source = fs.realpathSync(sourceRoot);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'impactgraph-auth-regression-'));
  fs.cpSync(source, root, { recursive: true, filter: file => !['node_modules', '.next', '.git', 'tsconfig.tsbuildinfo'].includes(path.basename(file)) });
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.next/\n*.tsbuildinfo\n');
  git(root, ['init', '-q']);
  git(root, ['-c', 'user.name=ImpactGraph Fixture', '-c', 'user.email=fixture@invalid.example', 'add', '.']);
  git(root, ['-c', 'user.name=ImpactGraph Fixture', '-c', 'user.email=fixture@invalid.example', 'commit', '-q', '-m', 'Baseline trusted authentication sample']);
  const deps = path.join(source, 'node_modules');
  if (!fs.existsSync(deps)) throw new Error('Install sample dependencies before preparing regression');
  fs.symlinkSync(deps, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const file = path.join(root, 'src/lib/services/session.ts');
  const baseline = fs.readFileSync(file, 'utf8');
  if (!baseline.includes("displayName: 'Demo User'")) throw new Error('Authentication sample baseline changed');
  fs.writeFileSync(file, baseline.replace("displayName: 'Demo User'", "displayName: 'Wrong User'"));
  return root;
}
