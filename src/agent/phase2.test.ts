import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ChatResult } from '@openrouter/sdk/models';
import { inspectGitDiff } from './git-analysis';
import { investigate } from './investigation';
import { prepareAuthRegression } from './scenario';
import { createCheckRegistry, executeCheck, sanitizeOutput, type Check } from './verification';

const sample = path.resolve('samples/auth-next');
function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'impactgraph-git-test-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'src/a.ts'), "export const a = 1;\n");
  fs.writeFileSync(path.join(root, 'src/b.ts'), "import { a } from './a';\nexport const b = a;\n");
  git(root, 'init', '-q'); git(root, 'add', '.');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid.example', 'commit', '-q', '-m', 'baseline');
  return root;
}
test('Git analysis handles unstaged, staged and committed changes with real reverse paths', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'export const a = 2;\n');
  let report = inspectGitDiff(root, { kind: 'unstaged' });
  assert.equal(report.files[0].status, 'modified');
  assert.deepEqual(report.files[0].changedLines, [1]);
  assert.deepEqual(report.files[0].impact?.directDependents, ['src/b.ts']);
  git(root, 'add', 'src/a.ts');
  report = inspectGitDiff(root, { kind: 'staged' });
  assert.equal(report.files[0].path, 'src/a.ts');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid.example', 'commit', '-q', '-m', 'change');
  const sha = git(root, 'rev-parse', 'HEAD');
  report = inspectGitDiff(root, { kind: 'committed', commit: sha });
  assert.equal(report.files[0].path, 'src/a.ts');
  assert.throws(() => inspectGitDiff(root, { kind: 'committed', commit: '--evil' }), /Invalid commit/);
});
test('Git analysis handles rename, deletion and outside symlink defensively', () => {
  const root = fixture();
  git(root, 'mv', 'src/b.ts', 'src/c.ts');
  let report = inspectGitDiff(root, { kind: 'staged' });
  assert.equal(report.files[0].status, 'renamed');
  assert.equal(report.files[0].previousPath, 'src/b.ts');
  git(root, 'rm', 'src/a.ts');
  report = inspectGitDiff(root, { kind: 'staged' });
  assert.equal(report.files.find(x => x.path === 'src/a.ts')?.status, 'deleted');
  assert.match(report.files.find(x => x.path === 'src/a.ts')?.limitation ?? '', /absent/);
});
test('Git analysis sees added files and limits a nested trusted root', () => {
  const repo = fixture();
  const trusted = path.join(repo, 'sample');
  fs.mkdirSync(path.join(trusted, 'src'), { recursive: true });
  fs.writeFileSync(path.join(trusted, 'package.json'), '{}');
  fs.writeFileSync(path.join(trusted, 'src/new.ts'), 'export const newValue = 1;\n');
  fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 3;\n');
  git(repo, 'add', 'sample');
  const report = inspectGitDiff(trusted, { kind: 'staged' });
  assert.ok(report.files.some(file => file.path === 'src/new.ts' && file.status === 'added'));
  assert.ok(report.files.every(file => !file.path.includes('..')));
  assert.ok(report.files.every(file => !file.path.includes('src/a.ts')));
});
test('verification approval, denial, failure, sanitization and unknown IDs', async () => {
  const root = prepareAuthRegression(sample);
  const registry = createCheckRegistry(root);
  assert.deepEqual(registry.map(x => x.id), ['auth-unit', 'typecheck']);
  const denied = await executeCheck(root, registry, 'auth-unit', async () => false);
  assert.equal(denied.status, 'denied');
  const failed = await executeCheck(root, registry, 'auth-unit', async () => true);
  assert.equal(failed.status, 'failed');
  assert.match(failed.stdout + failed.stderr, /Wrong User|Demo User/);
  const passed = await executeCheck(root, registry, 'typecheck', async () => true);
  assert.equal(passed.status, 'passed');
  await assert.rejects(() => executeCheck(root, registry, 'arbitrary', async () => true), /Unknown/);
  assert.equal(sanitizeOutput('OPENROUTER_API_KEY=secretvalue ' + root, root).text, 'OPENROUTER_API_KEY=<redacted> <sample-root>');
  assert.equal(sanitizeOutput('abcdef', root, 3).truncated, true);
});
test('verification timeout terminates process', async () => {
  const root = fs.realpathSync(sample);
  const check: Check = { id: 'timeout-test', description: 'test fixture', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: root, timeoutMs: 100 };
  const result = await executeCheck(root, [check], check.id, async () => true);
  assert.equal(result.status, 'timeout');
  assert.ok(result.durationMs < 5000);
});
test('verification cancellation terminates an approved running check', async () => {
  const root = fs.realpathSync(sample);
  const check: Check = { id: 'cancel-test', description: 'test fixture', executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: root, timeoutMs: 5000 };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  const result = await executeCheck(root, [check], check.id, async () => true, controller.signal);
  assert.equal(result.status, 'cancelled');
  assert.ok(result.durationMs < 5000);
});
test('verification timeout terminates a spawned child process', async () => {
  const root = fixture();
  const marker = path.join(root, 'child.pid');
  const script = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));setInterval(()=>{},1000);`;
  const check: Check = { id: 'tree-timeout', description: 'test fixture', executable: process.execPath, args: ['-e', script], cwd: root, timeoutMs: 500 };
  const result = await executeCheck(root, [check], check.id, async () => true);
  assert.equal(result.status, 'timeout');
  const pid = Number(fs.readFileSync(marker, 'utf8'));
  let alive = true;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { process.kill(pid, 0); } catch { alive = false; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(alive, false, 'spawned child remained alive after timeout');
});
test('verification reports source mutation as tooling failure', async () => {
  const root = fixture();
  const check: Check = { id: 'mutation-test', description: 'test fixture', executable: process.execPath, args: ['-e', "require('fs').writeFileSync('src/a.ts', 'export const a = 9;\\n')"], cwd: root, timeoutMs: 2000 };
  const result = await executeCheck(root, [check], check.id, async () => true);
  assert.equal(result.status, 'tooling_failure');
  assert.match(result.stderr, /Source files changed/);
});
function response(name?: string, args = '{}', content = ''): ChatResult {
  return { choices: [{ index: 0, finishReason: name ? 'tool_calls' : 'stop', message: { role: 'assistant', content, toolCalls: name ? [{ id: `call-${name}`, type: 'function', function: { name, arguments: args } }] : undefined } }], usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } } as ChatResult;
}
test('agent investigates actual failure, selects follow-up, preserves source', async () => {
  const root = prepareAuthRegression(sample);
  const file = path.join(root, 'src/lib/services/session.ts');
  const before = fs.readFileSync(file, 'utf8');
  const sequence = [response('inspect_git_diff'), response('get_file_impact', '{"file_path":"src/lib/services/session.ts"}'), response('list_verification_checks'), response('request_verification', '{"check_id":"auth-unit"}'), response('inspect_verification_result', '{"check_id":"auth-unit"}'), response('request_verification', '{"check_id":"typecheck"}'), response(undefined, '{}', JSON.stringify({ hypotheses: ['Changed session value violates the unit expectation'], potential_risks: ['API output may change'], unverified_assumptions: ['Runtime route not exercised'], assessment: 'Unit failed; typecheck passed.' }))];
  const model = { model: 'mock', async complete() { return sequence.shift()!; } };
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model, approve: async () => true });
  assert.equal(report.changedFiles[0], 'src/lib/services/session.ts');
  assert.equal(report.checks[0].status, 'failed');
  assert.equal(report.checks[1].status, 'passed');
  assert.ok(report.confirmedFindings.some(x => x.includes('auth-unit failed')));
  assert.equal(report.hypotheses.length, 1);
  assert.deepEqual(report.followUps, ['inspect_verification_result', 'request_verification']);
  assert.match(report.finalAssessment, /does not resolve that failure/);
  assert.ok(report.dependencyPaths.length > 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('malformed model final text cannot replace the evidence-backed assessment', async () => {
  const root = prepareAuthRegression(sample);
  const outputs = [response('inspect_git_diff'), response(undefined, '{}', '<function_calls>unsupported tool request</function_calls>')];
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model: { model: 'mock', async complete() { return outputs.shift()!; } }, approve: async () => false });
  assert.equal(report.stopReason, 'model_final_unstructured');
  assert.doesNotMatch(report.finalAssessment, /function_calls/);
});
test('agent rejects invalid tool arguments and respects tool step limit', async () => {
  const root = prepareAuthRegression(sample);
  const outputs = [response('inspect_git_diff', '{"bad":1}'), response('read_source_file', '{"file_path":"../../outside.ts"}'), response('inspect_git_diff'), response(undefined, '{}', 'Incomplete')];
  const model = { model: 'mock', async complete() { return outputs.shift()!; } };
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model, approve: async () => false, budget: { maxToolSteps: 3 } });
  assert.equal(report.toolRecords[0].error, 'Invalid tool arguments');
  assert.ok(report.toolRecords[1].error);
  assert.equal(report.checks.length, 0);
});
test('agent denial is returned to model and ninth tool call is blocked', async () => {
  const root = prepareAuthRegression(sample);
  const sequence = [response('inspect_git_diff'), response('list_verification_checks'), response('request_verification', '{"check_id":"auth-unit"}'), response('inspect_verification_result', '{"check_id":"auth-unit"}'), response('list_verification_checks'), response('list_verification_checks'), response('list_verification_checks'), response('list_verification_checks'), response('request_verification', '{"check_id":"typecheck"}')];
  const model = { model: 'mock', async complete() { return sequence.shift()!; } };
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model, approve: async () => false });
  assert.equal(report.checks[0].status, 'denied');
  assert.equal(report.stopReason, 'tool_step_limit');
  assert.equal(report.toolRecords.length, 8);
  assert.equal(report.checks.length, 1);
});
test('human approval wait does not exhaust the active investigation duration', async () => {
  const root = prepareAuthRegression(sample);
  const outputs = [response('inspect_git_diff'), response('request_verification', '{"check_id":"auth-unit"}'), response(undefined, '{}', JSON.stringify({ hypotheses: [], potential_risks: [], unverified_assumptions: [], assessment: 'Approval denied.' }))];
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model: { model: 'mock', async complete() { return outputs.shift()!; } }, approve: async () => { await new Promise(resolve => setTimeout(resolve, 1700)); return false; }, budget: { maxDurationMs: 1500 } });
  assert.equal(report.checks[0].status, 'denied');
  assert.equal(report.stopReason, 'model_final');
});
test('model API failure produces bounded local report', async () => {
  const root = prepareAuthRegression(sample);
  const report = await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model: { model: 'mock', async complete() { throw new Error('offline'); } }, approve: async () => false });
  assert.equal(report.stopReason, 'model_api_error');
});
test('agent publishes only real tool and report events', async () => {
  const root = prepareAuthRegression(sample);
  const events: { type: string; name?: string }[] = [];
  const outputs = [response('inspect_git_diff'), response(undefined, '{}', JSON.stringify({ hypotheses: [], potential_risks: [], unverified_assumptions: [], assessment: 'Observed diff.' }))];
  await investigate({ sampleRoot: root, selection: { kind: 'unstaged' }, model: { model: 'mock', async complete() { return outputs.shift()!; } }, approve: async () => false, onEvent: event => events.push(event) });
  assert.ok(events.some(event => event.type === 'tool_request' && event.name === 'inspect_git_diff'));
  assert.ok(events.some(event => event.type === 'git_diff'));
  assert.equal(events.at(-1)?.type, 'final_report');
});
