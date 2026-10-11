import { OpenRouter } from '@openrouter/sdk';
import type { ChatFunctionTool, ChatMessages, ChatResult, ChatToolChoice } from '@openrouter/sdk/models';

export const DEFAULT_MODEL = 'deepseek/deepseek-v3.2';

export type ProviderErrorKind = 'authentication' | 'insufficient_credit' | 'timeout' | 'api_error';

export function classifyProviderError(error: unknown): ProviderErrorKind {
  if (typeof error === 'object' && error !== null) {
    const value = error as { statusCode?: unknown; name?: unknown };
    if (value.statusCode === 401 || value.statusCode === 403) return 'authentication';
    if (value.statusCode === 402) return 'insufficient_credit';
    if (value.name === 'TimeoutError' || value.name === 'AbortError') return 'timeout';
  }
  return 'api_error';
}

export function createModelProvider(env: { OPENROUTER_API_KEY?: string; OPENROUTER_MODEL?: string } = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL: process.env.OPENROUTER_MODEL }) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const client = new OpenRouter({
    apiKey,
    timeoutMs: 30_000,
    retryConfig: { strategy: 'none' },
  });

  return {
    model,
    async complete(
      messages: ChatMessages[],
      tools: ChatFunctionTool[],
      toolChoice: ChatToolChoice,
      maxCompletionTokens = 256,
    ): Promise<ChatResult> {
      if (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens < 1 || maxCompletionTokens > 1024) {
        throw new Error('Invalid completion token limit');
      }
      const result = await client.chat.send({
        chatRequest: {
          model,
          messages,
          tools,
          toolChoice,
          parallelToolCalls: false,
          maxCompletionTokens,
          stream: false,
        },
      });
      if (!('choices' in result)) throw new Error('Unexpected streaming response');
      return result;
    },
  };
}
