import assert from 'node:assert/strict';
import test from 'node:test';
import { RunManager } from './run-manager';

const check = { id: 'auth-unit', description: 'Run reviewed unit tests', executable: 'C:/node.exe', args: ['--test', 'session.test.ts'], cwd: 'C:/trusted-sample', timeoutMs: 1000 };
test('approval is one-time and an approved check reaches the runner', async () => {
  let executions = 0;
  const manager = new RunManager(async ({ approve, emit }) => {
    emit({ type: 'tool_request', name: 'request_verification', summary: 'Requested verification' });
    if (await approve(check)) executions++;
    return { id: 'report', markdown: '# complete' } as never;
  });
  const id = manager.start({ scenario: 'auth-regression', diff: 'unstaged' });
  await new Promise(resolve => setImmediate(resolve));
  const pending = manager.get(id)?.pendingApproval;
  assert.equal(pending?.check.id, 'auth-unit');
  assert.equal(manager.decide(id, pending!.token, 'approve'), true);
  assert.equal(manager.decide(id, pending!.token, 'approve'), false);
  await manager.wait(id);
  assert.equal(executions, 1);
  assert.equal(manager.get(id)?.status, 'completed');
  assert.ok(manager.get(id)?.events.some(event => event.type === 'approval_decision'));
});
test('denied checks do not execute and concurrent starts are rejected', async () => {
  let executions = 0;
  const manager = new RunManager(async ({ approve }) => { if (await approve(check)) executions++; return { id: 'report', markdown: '' } as never; });
  const id = manager.start({ scenario: 'auth-regression', diff: 'unstaged' });
  assert.throws(() => manager.start({ scenario: 'auth-regression', diff: 'unstaged' }), /already active/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.decide(id, manager.get(id)!.pendingApproval!.token, 'deny'), true);
  await manager.wait(id);
  assert.equal(executions, 0);
});
test('cancellation resolves a pending approval without running the check', async () => {
  let executed = false;
  const manager = new RunManager(async ({ approve, signal }) => { if (await approve(check)) executed = true; assert.equal(signal.aborted, true); return { id: 'report', markdown: '' } as never; });
  const id = manager.start({ scenario: 'auth-regression', diff: 'unstaged' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.cancel(id), true);
  await manager.wait(id);
  assert.equal(executed, false);
  assert.equal(manager.get(id)?.status, 'cancelled');
});
test('the local run has a wall clock bound even while waiting for approval', async () => {
  const manager = new RunManager(async ({ approve }) => { await approve(check); return { id: 'report', markdown: '' } as never; }, 20);
  const id = manager.start({ scenario: 'auth-regression', diff: 'unstaged' });
  await manager.wait(id);
  assert.equal(manager.get(id)?.status, 'cancelled');
  assert.equal(manager.get(id)?.pendingApproval, undefined);
});
