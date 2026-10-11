import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { loadProjectData } from './project-data';

test('project graph and impact paths come from the real analyzer', () => {
  const project = loadProjectData(path.resolve('samples/auth-next'));
  assert.ok(project.files.includes('src/hooks/useAuth.ts'));
  assert.ok(project.edges.some(edge => edge.from === 'src/components/Header.tsx' && edge.to === 'src/hooks/useAuth.ts'));
  assert.ok(project.impacts['src/hooks/useAuth.ts'].directDependents.includes('src/components/Header.tsx'));
  assert.ok(project.impacts['src/hooks/useAuth.ts'].dependencyPaths.every(item => item.path.at(-1) === 'src/hooks/useAuth.ts'));
  assert.equal(project.roles['app/dashboard/page.tsx'].kind, 'page');
});
