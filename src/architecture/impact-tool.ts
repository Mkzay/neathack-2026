import fs from 'node:fs';
import path from 'node:path';
import { getImpact, indexProject, isWithinRoot } from './analyzer';

export const impactToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'get_file_impact',
    description: 'Analyze real local dependency edges and Next.js layout relationships for a file in the trusted sample. Returns paths and unresolved cases; impact is potential, not proof of breakage.',
    parameters: {
      type: 'object',
      properties: { file_path: { type: 'string', description: 'Project-relative JS/TS file path' } },
      required: ['file_path'],
      additionalProperties: false,
    },
  },
};

export function createImpactTool(projectRoot: string) {
  const index = indexProject(projectRoot);
  function parseArguments(raw: string): { filePath: string } {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('Invalid tool arguments'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid tool arguments');
    const fields = Object.keys(value);
    if (fields.length !== 1 || fields[0] !== 'file_path' || typeof (value as Record<string, unknown>).file_path !== 'string') {
      throw new Error('Invalid tool arguments');
    }
    return { filePath: (value as { file_path: string }).file_path };
  }
  function execute(input: { filePath: string }) {
    if (!input.filePath || path.isAbsolute(input.filePath)) throw new Error('Invalid file path outside sample root');
    const candidate = path.resolve(index.root, input.filePath);
    if (!isWithinRoot(index.root, candidate)) throw new Error('Invalid file path outside sample root');
    const resolved = fs.realpathSync(candidate);
    if (!isWithinRoot(index.root, resolved)) throw new Error('Invalid file path outside sample root');
    const normalized = path.relative(index.root, resolved).split(path.sep).join('/');
    return getImpact(index, normalized);
  }
  return { index, parseArguments, execute };
}
