import assert from 'node:assert/strict';
import path from 'node:path';
import { flush, init, setTraceOutput, shutdown, trace } from 'neatlogs';
import type { ChatFunctionTool, ChatResult } from '@openrouter/sdk/models';
import { classifyProviderError, createModelProvider } from '../openrouter-provider';
import { createImpactTool, impactToolDefinition } from './impact-tool';

const TARGET = 'src/hooks/useAuth.ts';
const traced = Boolean(process.env.NEATLOGS_API_KEY?.trim());
const usage = { promptTokens: 0, completionTokens: 0, costUsd: 0, costReported: false };

async function modelStep(name: string, run: () => Promise<ChatResult>): Promise<ChatResult> {
  const execute = async (span?: { setAttribute(key: string, value: string | number): void }) => {
    try {
      const result = await run();
      if (result.usage) {
        usage.promptTokens += result.usage.promptTokens;
        usage.completionTokens += result.usage.completionTokens;
        span?.setAttribute('gen_ai.usage.input_tokens', result.usage.promptTokens);
        span?.setAttribute('gen_ai.usage.output_tokens', result.usage.completionTokens);
        if (typeof result.usage.cost === 'number') {
          usage.costUsd += result.usage.cost;
          usage.costReported = true;
          span?.setAttribute('gen_ai.usage.cost_usd', result.usage.cost);
        }
      }
      span?.setAttribute('gen_ai.request.model', process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-v3.2');
      return result;
    } catch (error) {
      const kind = classifyProviderError(error);
      span?.setAttribute('impactgraph.api_error_kind', kind);
      if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
        span?.setAttribute('http.response.status_code', error.statusCode);
      }
      throw new Error(`OpenRouter ${kind}`, { cause: error });
    }
  };
  if (!traced) return execute();
  let response: ChatResult | undefined;
  await trace({ name, kind: 'LLM' }, async span => { response = await execute(span); });
  assert.ok(response, 'Missing model response');
  return response;
}

function validateAnswer(content: unknown, report: ReturnType<ReturnType<typeof createImpactTool>['execute']>) {
  assert.equal(typeof content, 'string', 'Model did not return text');
  let answer: unknown;
  const raw = (content as string).trim();
  const json = raw.startsWith('```json\n') && raw.endsWith('\n```') ? raw.slice(8, -4).trim() : raw;
  try { answer = JSON.parse(json); } catch { throw new Error('Model did not return valid JSON'); }
  assert.ok(answer && typeof answer === 'object' && !Array.isArray(answer), 'Expected a JSON object');
  const object = answer as Record<string, unknown>;
  assert.deepEqual(Object.keys(object).sort(), ['affected_files', 'caveat', 'dependency_paths', 'routes']);
  assert.ok(Array.isArray(object.affected_files) && object.affected_files.every(x => typeof x === 'string'));
  assert.ok(Array.isArray(object.routes) && object.routes.every(x => typeof x === 'string'));
  assert.ok(Array.isArray(object.dependency_paths));
  assert.equal(typeof object.caveat, 'string');
  const supported = new Map(report.dependencyPaths.map(item => [item.file, item.path]));
  const claimedFiles = object.affected_files as string[];
  const claimedRoutes = object.routes as string[];
  for (const file of claimedFiles) assert.ok(supported.has(file), `Unsupported file claim: ${file}`);
  for (const route of claimedRoutes) assert.ok(report.potentiallyAffectedRoutes.includes(route), `Unsupported route claim: ${route}`);
  for (const file of report.directDependents) assert.ok(claimedFiles.includes(file), `Missing direct dependent: ${file}`);
  for (const route of report.potentiallyAffectedRoutes) assert.ok(claimedRoutes.includes(route), `Missing affected route: ${route}`);
  const claimedPaths = object.dependency_paths as unknown[];
  for (const item of claimedPaths) {
    assert.ok(item && typeof item === 'object' && !Array.isArray(item));
    const claim = item as Record<string, unknown>;
    assert.deepEqual(Object.keys(claim).sort(), ['file', 'path']);
    assert.equal(typeof claim.file, 'string');
    assert.deepEqual(claim.path, supported.get(claim.file as string), `Unsupported dependency path for ${claim.file}`);
  }
  for (const file of claimedFiles) assert.ok(claimedPaths.some(item => (item as { file: string }).file === file), `Missing evidence path: ${file}`);
  assert.ok((object.caveat as string).toLowerCase().includes('runtime'), 'Missing runtime relationship caveat');
  return { affectedFiles: claimedFiles, routes: claimedRoutes, evidencePaths: claimedPaths.length };
}

async function runIntegration(): Promise<void> {
  const tool = createImpactTool(path.resolve('samples/auth-next'));
  const provider = createModelProvider();
  const definition = impactToolDefinition as ChatFunctionTool;
  const messages = [
    { role: 'system' as const, content: `Investigate the trusted sample only. The authentication hook is ${TARGET}. Call get_file_impact for that file before answering. Treat only tool output as dependency evidence. Do not infer runtime fetch relationships as confirmed imports.` },
    { role: 'user' as const, content: 'What parts of this application could be affected if the authentication hook changes?' },
  ];
  const first = await modelStep('openrouter_request_impact_tool', () => provider.complete(messages, [definition], 'required'));
  const call = first.choices[0]?.message.toolCalls?.[0];
  assert.ok(call, 'Model did not request the architecture tool');
  assert.equal(first.choices[0].message.toolCalls?.length, 1, 'Expected one tool call');
  assert.equal(call.type, 'function');
  assert.equal(call.function.name, 'get_file_impact');
  assert.ok(call.id, 'Missing tool call ID');
  const args = tool.parseArguments(call.function.arguments);
  assert.equal(args.filePath, TARGET, 'Model requested an unexpected file');

  let report: ReturnType<typeof tool.execute> | undefined;
  if (traced) {
    await trace({ name: 'get_file_impact', kind: 'TOOL', input: { filePath: args.filePath } }, async span => {
      report = tool.execute(args);
      span.setAttribute('impactgraph.dependent_count', report.dependencyPaths.length);
      span.setAttribute('impactgraph.route_count', report.potentiallyAffectedRoutes.length);
    });
  } else report = tool.execute(args);
  assert.ok(report, 'Missing architecture report');
  assert.equal(report.analyzedFile, TARGET);
  const finalInstruction = `Return only a JSON object with exactly these keys: affected_files (array of repository-relative paths), routes (array of route strings), dependency_paths (array of {"file":"...","path":["...", "..."]} for every affected_files entry), caveat (one sentence containing the word runtime). Include at least all direct dependents and all potentially affected routes. Copy each dependency path exactly from the tool output. State potential impact, not proven breakage. Do not claim relationships absent from tool output.`;
  const second = await modelStep('openrouter_request_impact_final', () => provider.complete([
    ...messages,
    first.choices[0].message,
    { role: 'tool' as const, toolCallId: call.id, content: JSON.stringify(report) },
    { role: 'user' as const, content: finalInstruction },
  ], [definition], 'none', 768));
  assert.equal(second.choices[0].message.toolCalls?.length ?? 0, 0, 'Unexpected additional tool call');
  const verified = validateAnswer(second.choices[0]?.message.content, report);
  if (traced) setTraceOutput('Real impact analysis completed: one validated tool call and evidence checked final answer');
  console.log(JSON.stringify({
    status: 'passed', model: provider.model, toolCalls: 1,
    analyzedFile: TARGET, graphFiles: tool.index.files.length, graphEdges: tool.index.edges.length,
    actualDirectDependents: report.directDependents, actualRoutes: report.potentiallyAffectedRoutes,
    verifiedAnswer: verified, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    costUsd: usage.costReported ? usage.costUsd : null, neatlogsExportAttempted: traced,
  }));
}

async function main(): Promise<void> {
  if (traced) await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: 'https://ingest.neatlogs.com',
    workflowName: 'impactgraph-real-impact-investigation',
  });
  try {
    if (traced) await trace({ name: 'impactgraph-auth-hook-investigation', kind: 'WORKFLOW' }, runIntegration);
    else await runIntegration();
  } finally {
    if (traced) { await flush(); await shutdown(); }
  }
}

main().catch((error: unknown) => {
  const kind = classifyProviderError(error instanceof Error && error.cause ? error.cause : error);
  console.error(`Real impact test failed (${kind}): ${error instanceof Error ? error.message : 'unknown error'}. Request details withheld.`);
  process.exitCode = 1;
});
