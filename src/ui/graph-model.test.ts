import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { loadProjectData } from '../web/project-data';
import { buildGraphView } from './graph-model';

test('graph view preserves analyzer edges and highlights actual impact paths', () => {
  const project = loadProjectData(path.resolve('samples/auth-next'));
  const view = buildGraphView(project, 'src/hooks/useAuth.ts', []);
  assert.equal(view.nodes.length, project.files.length);
  assert.equal(view.edges.length, project.edges.length);
  assert.equal(view.nodes.find(node => node.id === 'src/hooks/useAuth.ts')?.data.tone, 'selected');
  assert.equal(view.nodes.find(node => node.id === 'src/components/Header.tsx')?.data.tone, 'direct');
  assert.ok(view.edges.some(edge => edge.source === 'src/components/Header.tsx' && edge.target === 'src/hooks/useAuth.ts' && edge.animated));
  assert.ok(view.edges.every(edge => project.edges.some(actual => actual.from === edge.source && actual.to === edge.target)));
  assert.equal(view.nodes.find(node => node.id === 'src/lib/services/session.test.ts')?.data.category, 'Test');
});
