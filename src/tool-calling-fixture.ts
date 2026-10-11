export const FIXTURE_FILE = 'src/components/Button.tsx';

export const dependencyTool = {
  type: 'function' as const,
  function: {
    name: 'get_file_dependencies',
    description: 'Return the direct and indirect components that depend on one fixture file. This is a read-only in-memory fixture.',
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string', enum: [FIXTURE_FILE] } },
      required: ['file_path'],
      additionalProperties: false,
    },
  },
};

export function parseDependencyToolCall(raw: string): { filePath: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid tool arguments'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid tool arguments');
  }
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== 'file_path' || typeof (value as Record<string, unknown>).file_path !== 'string') {
    throw new Error('Invalid tool arguments');
  }
  return { filePath: (value as { file_path: string }).file_path };
}

export function getFileDependencies(filePath: string) {
  if (filePath !== FIXTURE_FILE) throw new Error('Unsupported fixture path');
  return {
    filePath,
    dependents: ['src/components/Toolbar.tsx', 'src/app/page.tsx'],
  };
}
