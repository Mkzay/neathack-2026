import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelProvider, classifyProviderError } from './openrouter-provider';
import { getFileDependencies, parseDependencyToolCall } from './tool-calling-fixture';

test('provider requires an API key and honors a configured model', () => {
  assert.throws(() => createModelProvider({}), /OPENROUTER_API_KEY/);
  const provider = createModelProvider({
    OPENROUTER_API_KEY: 'test-only-key',
    OPENROUTER_MODEL: 'example/model',
  });
  assert.equal(provider.model, 'example/model');
});

test('tool accepts only the named fixture path', () => {
  assert.deepEqual(getFileDependencies('src/components/Button.tsx'), {
    filePath: 'src/components/Button.tsx',
    dependents: ['src/components/Toolbar.tsx', 'src/app/page.tsx'],
  });
  assert.throws(() => getFileDependencies('../.env'), /Unsupported fixture path/);
});

test('tool call arguments reject malformed JSON and extra fields', () => {
  assert.deepEqual(parseDependencyToolCall('{"file_path":"src/components/Button.tsx"}'), {
    filePath: 'src/components/Button.tsx',
  });
  assert.throws(() => parseDependencyToolCall('{oops'), /Invalid tool arguments/);
  assert.throws(() => parseDependencyToolCall('{"file_path":"src/components/Button.tsx","shell":"whoami"}'), /Invalid tool arguments/);
});

test('provider errors separate authentication, credit, and timeout cases', () => {
  assert.equal(classifyProviderError({ statusCode: 401 }), 'authentication');
  assert.equal(classifyProviderError({ statusCode: 402 }), 'insufficient_credit');
  assert.equal(classifyProviderError({ name: 'TimeoutError' }), 'timeout');
});
