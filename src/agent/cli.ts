import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { init, flush, shutdown, trace } from 'neatlogs';
import { createModelProvider } from '../openrouter-provider';
import { investigate } from './investigation';
import { prepareAuthRegression } from './scenario';
import type { Approval } from './verification';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scenario = args.includes('--scenario=auth-regression');
  const selectionArg = args.find(arg => arg.startsWith('--diff='))?.slice(7) ?? 'unstaged';
  const selection = selectionArg === 'staged' || selectionArg === 'unstaged' ? { kind: selectionArg } as const
    : /^[a-f0-9]{7,40}$/i.test(selectionArg) ? { kind: 'committed' as const, commit: selectionArg } : undefined;
  if (!selection) throw new Error('Use --diff=staged, --diff=unstaged, or --diff=<commit SHA>');
  const source = path.resolve('samples/auth-next');
  const sampleRoot = scenario ? prepareAuthRegression(source) : source;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const approve: Approval = async check => {
    const answer = await rl.question(`Approve ${check.id}: ${check.description}\nExecutable: ${check.executable}\nArguments: ${check.args.join(' ')}\nWorking directory: ${check.cwd}\nRun this check? Type YES to approve: `);
    return answer.trim() === 'YES';
  };
  const traced = Boolean(process.env.NEATLOGS_API_KEY?.trim());
  if (traced) await init({ apiKey: process.env.NEATLOGS_API_KEY, endpoint: 'https://ingest.neatlogs.com', workflowName: 'impactgraph-autonomous-investigation' });
  try {
    const provider = createModelProvider();
    const run = () => investigate({ sampleRoot, selection, model: provider, approve, traced,
      budget: { maxCostUsd: Number(process.env.IMPACTGRAPH_MAX_COST_USD ?? '0.10'), maxTokens: Number(process.env.IMPACTGRAPH_MAX_TOKENS ?? '24000') } });
    let report: Awaited<ReturnType<typeof run>>;
    if (traced) { let value: Awaited<ReturnType<typeof run>> | undefined; await trace({ name: 'impactgraph_investigation', kind: 'WORKFLOW' }, async () => { value = await run(); }); report = value!; }
    else report = await run();
    const out = path.resolve('reports'); fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, `${report.id}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    fs.writeFileSync(file.replace(/\.json$/, '.md'), report.markdown);
    console.log(report.markdown);
    console.log(`\nLocal records: ${file}`);
    console.log(`Usage: ${report.usage.promptTokens} prompt tokens, ${report.usage.completionTokens} completion tokens, cost ${report.usage.costUsd ?? 'unavailable'} USD`);
    if (scenario) console.log(`Regression sample: ${sampleRoot}`);
  } finally {
    rl.close();
    if (traced) { await flush(); await shutdown(); }
  }
}

main().catch(error => { console.error(`Investigation failed: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; });
