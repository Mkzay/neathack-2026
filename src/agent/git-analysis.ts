import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getImpact, indexProject, isWithinRoot, type ImpactReport } from '../architecture/analyzer';

export type DiffSelection = { kind: 'staged' | 'unstaged' | 'committed'; commit?: string };
export type ChangedFile = { path: string; previousPath?: string; status: 'added' | 'modified' | 'renamed' | 'deleted'; changedLines: number[]; impact?: ImpactReport; limitation?: string };
export type DiffReport = { selection: DiffSelection; files: ChangedFile[]; limitations: string[] };

function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', shell: false, timeout: 10_000, maxBuffer: 2_000_000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Git inspection failed: ${result.error?.message ?? String(result.stderr).slice(0, 160)}`);
  return result.stdout;
}

function diffArgs(selection: DiffSelection): string[] {
  if (selection.kind === 'staged') return ['diff', '--cached'];
  if (selection.kind === 'unstaged') return ['diff'];
  if (!selection.commit || !/^[a-f0-9]{7,40}$/i.test(selection.commit)) throw new Error('Invalid commit identifier');
  return ['diff', `${selection.commit}^`, selection.commit];
}

export function inspectGitDiff(sampleRoot: string, selection: DiffSelection): DiffReport {
  const root = fs.realpathSync(sampleRoot);
  const repo = git(root, ['rev-parse', '--show-toplevel']).trim();
  const prefix = path.relative(repo, root).split(path.sep).join('/');
  if (prefix.startsWith('..') || path.isAbsolute(prefix)) throw new Error('Sample is outside Git repository');
  const base = diffArgs(selection);
  const names = git(repo, [...base, '--name-status', '-z', '--find-renames', '--', prefix || '.']).split('\0');
  const index = indexProject(root);
  const files: ChangedFile[] = [];
  const limitations: string[] = [];
  for (let i = 0; i < names.length && names[i];) {
    const code = names[i++];
    const oldName = code.startsWith('R') ? names[i++] : undefined;
    const repoName = names[i++];
    if (!repoName) break;
    const relative = path.posix.relative(prefix || '.', repoName.replaceAll('\\', '/'));
    const absolute = path.resolve(root, relative);
    if (!isWithinRoot(root, absolute)) { limitations.push('Git reported a path outside the trusted sample'); continue; }
    if (fs.existsSync(absolute) && !isWithinRoot(root, fs.realpathSync(absolute))) { limitations.push(`${relative}: symlink target is outside sample`); continue; }
    const status = code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : code.startsWith('R') ? 'renamed' : 'modified';
    const previousPath = oldName ? path.posix.relative(prefix || '.', oldName.replaceAll('\\', '/')) : undefined;
    const patch = git(repo, [...base, '--unified=0', '--no-ext-diff', '--', repoName]);
    const lines = new Set<number>();
    for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(match[1]); const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let n = start; n < start + count && lines.size < 500; n++) lines.add(n);
    }
    const file: ChangedFile = { path: relative, previousPath, status, changedLines: [...lines].sort((a, b) => a - b) };
    if (index.files.includes(relative)) file.impact = getImpact(index, relative);
    else file.limitation = status === 'deleted' ? 'Deleted file is absent from the current architecture index; prior dependents cannot be confirmed.' : 'File is outside indexed JS/TS source files.';
    files.push(file);
  }
  if (!files.length) limitations.push('No tracked changes found. Untracked files do not appear in Git diffs.');
  return { selection, files, limitations };
}
