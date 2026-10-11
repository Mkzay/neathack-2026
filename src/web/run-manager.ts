import { randomUUID } from 'node:crypto';
import type { AgentEvent, Investigation } from '../agent/investigation';
import type { Approval, Check } from '../agent/verification';

export type RunStart = { scenario: 'auth-regression' | 'working-tree'; diff: 'unstaged' | 'staged' };
export type TimelineEvent = AgentEvent & { id: number; at: string };
export type PendingApproval = { token: string; check: Check };
export type PublicReport = Omit<Investigation, 'toolRecords'>;
export type RunSnapshot = { id: string; status: 'running' | 'awaiting_approval' | 'cancelling' | 'cancelled' | 'completed' | 'failed'; input: RunStart; events: TimelineEvent[]; pendingApproval?: PendingApproval; report?: PublicReport; error?: string };
export type RunContext = { input: RunStart; approve: Approval; emit: (event: AgentEvent) => void; signal: AbortSignal };
type Executor = (context: RunContext) => Promise<Investigation>;
type Internal = RunSnapshot & { controller: AbortController; nextEventId: number; resolveApproval?: (approved: boolean) => void; task?: Promise<void> };

export class RunManager {
  private runs = new Map<string, Internal>();
  private activeId: string | undefined;
  constructor(private readonly execute: Executor, private readonly maxWallMs = 600_000) {}

  start(input: RunStart): string {
    if (this.activeId) throw new Error('An investigation is already active');
    const id = randomUUID();
    const run: Internal = { id, status: 'running', input, events: [], controller: new AbortController(), nextEventId: 1 };
    this.runs.set(id, run); this.activeId = id;
    const wallTimer = setTimeout(() => this.cancel(id), this.maxWallMs);
    const emit = (event: AgentEvent) => { run.events.push({ ...event, id: run.nextEventId++, at: new Date().toISOString() }); if (run.events.length > 200) run.events.shift(); };
    const approve: Approval = async check => {
      if (run.controller.signal.aborted) return false;
      const token = randomUUID();
      run.pendingApproval = { token, check }; run.status = 'awaiting_approval';
      emit({ type: 'approval_requested', name: check.id, summary: `Approval requested for ${check.id}` });
      return new Promise<boolean>(resolve => { run.resolveApproval = resolve; });
    };
    run.task = Promise.resolve().then(async () => {
      try {
        const report = await this.execute({ input, approve, emit, signal: run.controller.signal });
        const { toolRecords, ...publicReport } = report;
        void toolRecords;
        run.report = publicReport;
        run.status = run.controller.signal.aborted ? 'cancelled' : 'completed';
      } catch {
        run.status = run.controller.signal.aborted ? 'cancelled' : 'failed';
        run.error = run.status === 'cancelled' ? undefined : 'Investigation failed before a report was produced.';
        emit({ type: 'error', summary: run.error ?? 'Investigation cancelled' });
      } finally {
        clearTimeout(wallTimer);
        run.pendingApproval = undefined; run.resolveApproval = undefined;
        if (this.activeId === id) this.activeId = undefined;
      }
    });
    return id;
  }

  get(id: string): RunSnapshot | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    return { id: run.id, status: run.status, input: run.input, events: [...run.events], pendingApproval: run.pendingApproval, report: run.report, error: run.error };
  }

  decide(id: string, token: string, decision: 'approve' | 'deny'): boolean {
    const run = this.runs.get(id);
    if (!run || run.status !== 'awaiting_approval' || run.pendingApproval?.token !== token || !run.resolveApproval) return false;
    const checkId = run.pendingApproval.check.id;
    const resolve = run.resolveApproval;
    run.pendingApproval = undefined; run.resolveApproval = undefined; run.status = 'running';
    run.events.push({ id: run.nextEventId++, at: new Date().toISOString(), type: 'approval_decision', name: checkId, summary: `${decision === 'approve' ? 'Approved' : 'Denied'} ${checkId}` });
    resolve(decision === 'approve');
    return true;
  }

  cancel(id: string): boolean {
    const run = this.runs.get(id);
    if (!run || !['running', 'awaiting_approval'].includes(run.status)) return false;
    run.status = 'cancelling'; run.controller.abort();
    run.pendingApproval = undefined; run.resolveApproval?.(false); run.resolveApproval = undefined;
    run.events.push({ id: run.nextEventId++, at: new Date().toISOString(), type: 'cancellation', summary: 'Cancellation requested' });
    return true;
  }

  async wait(id: string): Promise<void> { await this.runs.get(id)?.task; }
}
