import { OpenRouter } from '@openrouter/agent';
import { flush, init, shutdown } from 'neatlogs';
import { wrapOpenRouterAgent } from 'neatlogs/openrouter-agent';

async function main(): Promise<void> {
  if (!process.env.NEATLOGS_API_KEY || !process.env.OPENROUTER_API_KEY) {
    throw new Error('Set NEATLOGS_API_KEY and OPENROUTER_API_KEY in .env before running.');
  }

  await init({
    apiKey: process.env.NEATLOGS_API_KEY,
    endpoint: 'https://ingest.neatlogs.com',
    workflowName: 'openrouter-smoke-test',
  });

  try {
    const client = wrapOpenRouterAgent(
      new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }),
    );
    const result = client.callModel({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      input: 'Reply with one short sentence explaining what a trace records.',
      maxOutputTokens: 40,
    });

    // Consuming the result finalizes Neatlogs' OpenRouter LLM span.
    console.log(await result.getText());
  } finally {
    await flush();
    await shutdown();
  }
}

main().catch(() => {
  // Avoid printing errors that could include provider request details or credentials.
  console.error('Trace test failed. Check local keys, model access, and network connectivity.');
  process.exitCode = 1;
});
