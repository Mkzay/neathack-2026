import assert from 'node:assert/strict';
import { flush, init, setTraceOutput, shutdown, trace } from 'neatlogs';
import type { ChatResult } from '@openrouter/sdk/models';
import { classifyProviderError, createModelProvider } from './openrouter-provider';
import { dependencyTool, FIXTURE_FILE, getFileDependencies, parseDependencyToolCall } from './tool-calling-fixture';

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
  await trace({ name, kind: 'LLM' }, async (span) => {
    response = await execute(span);
  });
  assert.ok(response, 'Missing model response');
  return response;
}

async function runIntegration(): Promise<void> {
  const provider = createModelProvider();
  const messages = [
    { role: 'system' as const, content: 'Use the supplied tool before answering. List only the dependent component paths returned by the tool.' },
    { role: 'user' as const, content: `Investigate which components depend on ${FIXTURE_FILE}.` },
  ];
  const first = await modelStep('openrouter_request_tool', () =>
    provider.complete(messages, [dependencyTool], 'required'));
  const call = first.choices[0]?.message.toolCalls?.[0];
  assert.ok(call, 'Model did not return a tool call');
  assert.equal(first.choices[0].message.toolCalls?.length, 1, 'Expected exactly one tool call');
  assert.equal(call.type, 'function');
  assert.equal(call.function.name, 'get_file_dependencies');
  assert.ok(call.id, 'Missing tool call ID');
  const args = parseDependencyToolCall(call.function.arguments);
  assert.equal(args.filePath, FIXTURE_FILE);

  let result: ReturnType<typeof getFileDependencies> | undefined;
  if (traced) {
    await trace({ name: 'get_file_dependencies', kind: 'TOOL', input: { filePath: args.filePath } }, async () => {
      result = getFileDependencies(args.filePath);
    });
  } else result = getFileDependencies(args.filePath);
  assert.ok(result, 'Missing tool result');
  const second = await modelStep('openrouter_request_final', () =>
    provider.complete([
      ...messages,
      first.choices[0].message,
      { role: 'tool', toolCallId: call.id, content: JSON.stringify(result) },
    ], [dependencyTool], 'none'));
  const answer = second.choices[0]?.message.content;
  assert.equal(typeof answer, 'string', 'Expected a text answer');
  for (const dependent of result.dependents) {
    assert.ok((answer as string).includes(dependent), `Final answer omitted ${dependent}`);
  }
  assert.equal(second.choices[0].message.toolCalls?.length ?? 0, 0, 'Unexpected extra tool call');
  if (traced) setTraceOutput('Tool calling succeeded with two verified dependents');
  console.log(JSON.stringify({
    status: 'passed', model: provider.model, toolCalls: 1,
    dependents: result.dependents,
    promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    costUsd: usage.costReported ? usage.costUsd : null,
    neatlogsExportAttempted: traced,
  }));
}

async function main(): Promise<void> {
  if (traced) await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: 'https://ingest.neatlogs.com',
    workflowName: 'impactgraph-openrouter-tool-test',
  });
  try {
    if (traced) await trace({ name: 'impactgraph-tool-calling', kind: 'WORKFLOW' }, runIntegration);
    else await runIntegration();
  } finally {
    if (traced) { await flush(); await shutdown(); }
  }
}

main().catch((error: unknown) => {
  const kind = classifyProviderError(error instanceof Error && error.cause ? error.cause : error);
  console.error(`Tool-calling test failed (${kind}). Request details withheld.`);
  process.exitCode = 1;
});
