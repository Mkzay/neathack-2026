import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type EdgeKind = 'import' | 're-export' | 'dynamic-import' | 'next-layout';
export type DependencyEdge = { from: string; to: string; kind: EdgeKind; specifier?: string };
export type FileRole = { kind: 'page' | 'layout' | 'route' | 'loading' | 'error' | 'not-found' | 'template' | 'default' | 'global-error'; route: string };
export type UnresolvedImport = { file: string; specifier: string; reason: string };
export type ProjectIndex = {
  root: string;
  files: string[];
  edges: DependencyEdge[];
  roles: Record<string, FileRole>;
  unresolved: UnresolvedImport[];
  limitations: string[];
  cycles: string[][];
};
export type ImpactPath = { file: string; path: string[] };
export type ImpactReport = {
  analyzedFile: string;
  directDependents: string[];
  transitiveDependents: string[];
  dependencyPaths: ImpactPath[];
  potentiallyAffectedRoutes: string[];
  unresolvedRelationships: UnresolvedImport[];
  analysisLimitations: string[];
  detectedCycles: string[][];
};

const extensions = ['.ts', '.tsx', '', '.jsx'];
const excluded = ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', '**/.git/**'];
const roleNames = new Set(['page', 'layout', 'route', 'loading', 'error', 'not-found', 'template', 'default', 'global-error']);

export function isWithinRoot(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalize(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

function roleFor(file: string): FileRole | undefined {
  const parts = file.split('/');
  const appIndex = parts[0] === 'app' ? 0 : parts[0] === 'src' && parts[1] === 'app' ? 1 : -1;
  if (appIndex < 0) return undefined;
  const name = path.posix.parse(parts.at(-1)!).name;
  if (!roleNames.has(name)) return undefined;
  const segments = parts.slice(appIndex + 1, -1).filter(p => !/^\(.+\)$/.test(p) && !p.startsWith('@'));
  return { kind: name as FileRole['kind'], route: `/${segments.join('/')}` };
}

function loadOptions(root: string): ts.CompilerOptions {
  const config = ['tsconfig.json', 'jsconfig.json'].map(name => path.join(root, name)).find(fs.existsSync);
  if (!config) return { allowJs: true, jsx: ts.JsxEmit.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error) throw new Error(`Invalid ${path.basename(config)}`);
  read.config.compilerOptions = { ...read.config.compilerOptions, allowJs: true };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(`Invalid ${path.basename(config)} compiler options`);
  return { ...parsed.options, allowJs: true, jsx: parsed.options.jsx ?? ts.JsxEmit.Preserve };
}

function isConfiguredAlias(specifier: string, paths: ts.MapLike<string[]> | undefined): boolean {
  return Object.keys(paths ?? {}).some(pattern => {
    const star = pattern.indexOf('*');
    return star < 0 ? specifier === pattern : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
  });
}

function collectSpecifiers(source: ts.SourceFile, file: string, limitations: string[]) {
  const found: { specifier: string; kind: EdgeKind }[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: 'import' });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: 're-export' });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) found.push({ specifier: arg.text, kind: 'dynamic-import' });
      else limitations.push(`${file}: non-literal dynamic import cannot be resolved statically`);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      limitations.push(`${file}: CommonJS require() is not analyzed`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function findCycles(files: string[], edges: DependencyEdge[]): string[][] {
  const outgoing = new Map(files.map(file => [file, [] as string[]]));
  for (const edge of edges) outgoing.get(edge.from)?.push(edge.to);
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();
  function visit(file: string): void {
    visited.add(file); active.add(file); stack.push(file);
    for (const next of [...new Set(outgoing.get(file) ?? [])].sort()) {
      if (!visited.has(next)) visit(next);
      else if (active.has(next)) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join('|');
        cycles.set(key, [...cycle].sort());
      }
    }
    stack.pop(); active.delete(file);
  }
  for (const file of files) if (!visited.has(file)) visit(file);
  return [...cycles.values()].sort((a, b) => a.join('|').localeCompare(b.join('|')));
}

export function indexProject(projectRoot: string): ProjectIndex {
  const root = fs.realpathSync(projectRoot);
  const options = loadOptions(root);
  const files: string[] = [];
  const absolute = new Map<string, string>();
  const limitations: string[] = [
    'File-level imports and re-export barrels show possible impact; they do not prove a referenced symbol is used.',
    'Runtime relationships such as fetch URLs, framework conventions beyond layouts, and dependency injection are not inferred as import edges.',
  ];
  for (const discovered of ts.sys.readDirectory(root, extensions, excluded)) {
    if (discovered.endsWith('.d.ts')) continue;
    const resolved = fs.realpathSync(discovered);
    if (!isWithinRoot(root, resolved)) {
      limitations.push(`${normalize(root, discovered)}: symlink points outside project root`);
      continue;
    }
    const name = normalize(root, resolved);
    if (!absolute.has(name)) { files.push(name); absolute.set(name, resolved); }
  }
  files.sort();
  const edges: DependencyEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const roles: Record<string, FileRole> = {};
  for (const file of files) {
    const role = roleFor(file);
    if (role) roles[file] = role;
    const filePath = absolute.get(file)!;
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const found of collectSpecifiers(source, file, limitations)) {
      const local = found.specifier.startsWith('.') || isConfiguredAlias(found.specifier, options.paths);
      const resolution = ts.resolveModuleName(found.specifier, filePath, options, ts.sys).resolvedModule;
      if (!resolution) {
        if (local) unresolved.push({ file, specifier: found.specifier, reason: 'module not resolved' });
        continue;
      }
      const target = path.resolve(resolution.resolvedFileName);
      if (!isWithinRoot(root, target)) continue;
      const targetName = normalize(root, target);
      if (absolute.has(targetName)) edges.push({ from: file, to: targetName, kind: found.kind, specifier: found.specifier });
      else if (local) unresolved.push({ file, specifier: found.specifier, reason: 'resolved target is outside indexed source files' });
    }
  }
  for (const [file, role] of Object.entries(roles)) {
    if (role.kind !== 'page') continue;
    const parts = file.split('/');
    const appIndex = parts[0] === 'app' ? 0 : 1;
    for (let depth = parts.length - 2; depth >= appIndex; depth--) {
      const dir = parts.slice(0, depth + 1).join('/');
      const layout = files.find(candidate => candidate.startsWith(`${dir}/layout.`) && roles[candidate]?.kind === 'layout');
      if (layout) edges.push({ from: file, to: layout, kind: 'next-layout' });
    }
  }
  const unique = new Map(edges.map(edge => [`${edge.from}|${edge.to}|${edge.kind}`, edge]));
  const sortedEdges = [...unique.values()].sort((a, b) => `${a.from}|${a.to}|${a.kind}`.localeCompare(`${b.from}|${b.to}|${b.kind}`));
  return { root, files, edges: sortedEdges, roles, unresolved: unresolved.sort((a,b) => `${a.file}|${a.specifier}`.localeCompare(`${b.file}|${b.specifier}`)), limitations: [...new Set(limitations)].sort(), cycles: findCycles(files, sortedEdges) };
}

export function getImpact(index: ProjectIndex, analyzedFile: string): ImpactReport {
  if (!index.files.includes(analyzedFile)) throw new Error('File is not in the architecture index');
  const incoming = new Map(index.files.map(file => [file, [] as string[]]));
  for (const edge of index.edges) incoming.get(edge.to)?.push(edge.from);
  const paths = new Map<string, string[]>([[analyzedFile, [analyzedFile]]]);
  const queue = [analyzedFile];
  for (let position = 0; position < queue.length; position++) {
    const current = queue[position];
    for (const dependent of [...new Set(incoming.get(current) ?? [])].sort()) {
      if (paths.has(dependent)) continue;
      paths.set(dependent, [dependent, ...paths.get(current)!]);
      queue.push(dependent);
    }
  }
  paths.delete(analyzedFile);
  const dependencyPaths = [...paths].map(([file, path]) => ({ file, path })).sort((a,b) => a.file.localeCompare(b.file));
  const affected = new Set([analyzedFile, ...paths.keys()]);
  return {
    analyzedFile,
    directDependents: dependencyPaths.filter(p => p.path.length === 2).map(p => p.file),
    transitiveDependents: dependencyPaths.filter(p => p.path.length > 2).map(p => p.file),
    dependencyPaths,
    potentiallyAffectedRoutes: [...new Set([...affected].filter(file => ['page', 'route'].includes(index.roles[file]?.kind ?? '')).map(file => index.roles[file].route))].sort(),
    unresolvedRelationships: index.unresolved.filter(item => affected.has(item.file)),
    analysisLimitations: index.limitations,
    detectedCycles: index.cycles.filter(cycle => cycle.some(file => affected.has(file))),
  };
}
