import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { indexProject, getImpact } from './analyzer';
import { createImpactTool } from './impact-tool';

function withProject(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'impactgraph-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('relative imports, re-exports, and reverse paths reflect source files', () => {
  withProject({
    'tsconfig.json': JSON.stringify({ compilerOptions: { allowJs: true } }),
    'src/base.js': 'export const value = 1;',
    'src/barrel.ts': "export { value } from './base.js';",
    'src/view.tsx': "import { value } from './barrel'; export const View = () => value;",
  }, root => {
    const index = indexProject(root);
    const impact = getImpact(index, 'src/base.js');
    assert.deepEqual(impact.directDependents, ['src/barrel.ts']);
    assert.deepEqual(impact.transitiveDependents, ['src/view.tsx']);
    assert.deepEqual(impact.dependencyPaths.find(p => p.file === 'src/view.tsx')?.path,
      ['src/view.tsx', 'src/barrel.ts', 'src/base.js']);
    assert.ok(index.edges.some(e => e.kind === 're-export' && e.from === 'src/barrel.ts' && e.to === 'src/base.js'));
  });
});

test('alias, literal dynamic import, jsconfig, and App Router roles are recognized', () => {
  withProject({
    'jsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    'src/hooks/useAuth.jsx': 'export function useAuth() { return true; }',
    'src/components/AuthPanel.jsx': "import { useAuth } from '@/hooks/useAuth'; export const AuthPanel = () => useAuth();",
    'app/layout.jsx': 'export default function Layout({children}) { return children; }',
    'app/page.jsx': "const load = () => import('@/components/AuthPanel'); export default function Page() { return null; }",
    'app/api/session/route.js': 'export function GET() { return Response.json({ ok: true }); }',
  }, root => {
    const index = indexProject(root);
    assert.ok(index.edges.some(e => e.kind === 'dynamic-import' && e.from === 'app/page.jsx' && e.to === 'src/components/AuthPanel.jsx'));
    assert.ok(index.edges.some(e => e.kind === 'next-layout' && e.from === 'app/page.jsx' && e.to === 'app/layout.jsx'));
    assert.equal(index.roles['app/page.jsx']?.kind, 'page');
    assert.equal(index.roles['app/api/session/route.js']?.kind, 'route');
    assert.equal(index.roles['app/layout.jsx']?.kind, 'layout');
    assert.deepEqual(getImpact(index, 'src/hooks/useAuth.jsx').potentiallyAffectedRoutes, ['/']);
  });
});

test('cycles terminate traversal; unresolved and unsupported imports are reported', () => {
  withProject({
    'src/a.ts': "import './b'; export const a = 1;",
    'src/b.ts': "import './a'; import './missing'; const x = import(name); export const b = 2;",
  }, root => {
    const index = indexProject(root);
    assert.ok(index.cycles.some(c => c.includes('src/a.ts') && c.includes('src/b.ts')));
    assert.ok(index.unresolved.some(u => u.file === 'src/b.ts' && u.specifier === './missing'));
    assert.ok(index.limitations.some(l => l.includes('non-literal dynamic import')));
    assert.deepEqual(getImpact(index, 'src/a.ts').directDependents, ['src/b.ts']);
    assert.ok(getImpact(index, 'src/a.ts').detectedCycles.some(c => c.includes('src/a.ts') && c.includes('src/b.ts')));
  });
});

test('impact tool rejects traversal and absolute paths outside its root', () => {
  withProject({ 'src/hook.ts': 'export const value = 1;' }, root => {
    const tool = createImpactTool(root);
    assert.equal(tool.execute({ filePath: 'src/hook.ts' }).analyzedFile, 'src/hook.ts');
    assert.throws(() => tool.execute({ filePath: '../.env' }), /outside|Invalid/i);
    assert.throws(() => tool.execute({ filePath: path.resolve(root, '..', 'private.ts') }), /outside|Invalid/i);
    assert.throws(() => tool.parseArguments('{"file_path":"src/hook.ts","shell":"pwd"}'), /Invalid tool arguments/);
  });
});

test('trusted Next.js sample exposes the documented auth hook impact paths', () => {
  const root = path.resolve('samples/auth-next');
  const index = indexProject(root);
  const impact = getImpact(index, 'src/hooks/useAuth.ts');
  assert.deepEqual(impact.directDependents, [
    'src/components/Header.tsx', 'src/components/ProfileCard.tsx', 'src/components/SettingsPanel.tsx',
  ]);
  assert.deepEqual(impact.potentiallyAffectedRoutes, ['/', '/dashboard', '/settings']);
  const dashboardPath = impact.dependencyPaths.find(p => p.file === 'app/dashboard/page.tsx')?.path;
  assert.deepEqual(dashboardPath?.[0], 'app/dashboard/page.tsx');
  assert.deepEqual(dashboardPath?.at(-1), 'src/hooks/useAuth.ts');
  for (let step = 0; step < (dashboardPath?.length ?? 0) - 1; step++) {
    assert.ok(index.edges.some(edge => edge.from === dashboardPath![step] && edge.to === dashboardPath![step + 1]));
  }
  assert.ok(!impact.dependencyPaths.some(p => p.file === 'app/api/session/route.ts'));
  assert.deepEqual(index.unresolved, []);
});
