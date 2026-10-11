import fs from 'node:fs';
import path from 'node:path';
import { flush, init, shutdown, trace } from 'neatlogs';
import { investigate, type Investigation } from '../agent/investigation';
import { prepareAuthRegression } from '../agent/scenario';
import { createModelProvider } from '../openrouter-provider';
import { RunManager } from './run-manager';

const trustedSample = path.resolve(process.cwd(), 'samples/auth-next');

async function executeRun({ input, approve, emit, signal }: Parameters<ConstructorParameters<typeof RunManager>[0]>[0]): Promise<Investigation> {
  const sampleRoot = input.scenario === 'auth-regression' ? prepareAuthRegression(trustedSample) : trustedSample;
  let provider: ReturnType<typeof createModelProvider>;
  try { provider = createModelProvider(); }
  catch { emit({ type: 'error', summary: 'OPENROUTER_API_KEY is not configured on the server.' }); throw new Error('Provider unavailable'); }
  let traced = false;
  if (process.env.NEATLOGS_API_KEY?.trim()) {
    try { await init({ apiKey: process.env.NEATLOGS_API_KEY, endpoint: 'https://ingest.neatlogs.com', workflowName: 'impactgraph-web-investigation' }); traced = true; }
    catch { emit({ type: 'error', summary: 'neatlogs initialization failed; local investigation will continue.' }); }
  }
  try {
    const run = () => investigate({ sampleRoot, selection: { kind: input.scenario === 'auth-regression' ? 'unstaged' : input.diff }, model: provider, approve, onEvent: emit, signal, traced,
      budget: { maxCostUsd: Number(process.env.IMPACTGRAPH_MAX_COST_USD ?? '0.10'), maxTokens: Number(process.env.IMPACTGRAPH_MAX_TOKENS ?? '24000') } });
    let report: Investigation;
    if (traced) { let value: Investigation | undefined; await trace({ name: 'impactgraph_web_investigation', kind: 'WORKFLOW' }, async () => { value = await run(); }); report = value!; }
    else report = await run();
    const output = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, `${report.id}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, `${report.id}.md`), report.markdown);
    return report;
  } finally {
    if (traced) {
      try { await flush(); await shutdown(); }
      catch { emit({ type: 'error', summary: 'neatlogs export failed; local investigation record remains available.' }); }
    }
  }
}

declare global { var __impactGraphRunManager: RunManager | undefined; }
export function getRunManager(): RunManager {
  globalThis.__impactGraphRunManager ??= new RunManager(executeRun);
  return globalThis.__impactGraphRunManager;
}
