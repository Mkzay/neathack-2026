import { getImpact, indexProject, type DependencyEdge, type FileRole, type ImpactReport, type UnresolvedImport } from '../architecture/analyzer';
import { inspectGitDiff, type ChangedFile } from '../agent/git-analysis';

export type ProjectData = { name: string; files: string[]; edges: DependencyEdge[]; roles: Record<string, FileRole>; impacts: Record<string, ImpactReport>; changes: ChangedFile[]; unresolved: UnresolvedImport[]; limitations: string[]; cycles: string[][] };

export function loadProjectData(sampleRoot: string): ProjectData {
  const index = indexProject(sampleRoot);
  const impacts = Object.fromEntries(index.files.map(file => [file, getImpact(index, file)]));
  const changes = inspectGitDiff(sampleRoot, { kind: 'unstaged' }).files;
  return { name: 'Auth Next Sample', files: index.files, edges: index.edges, roles: index.roles, impacts, changes, unresolved: index.unresolved, limitations: index.limitations, cycles: index.cycles };
}
