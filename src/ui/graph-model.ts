import type { Edge, Node } from '@xyflow/react';
import type { ProjectData } from '../web/project-data';

export type ModuleTone = 'selected' | 'direct' | 'transitive' | 'changed' | 'muted';
export type ModuleNode = Node<{ file: string; label: string; subtitle: string; category: string; tone: ModuleTone }, 'module'>;

function category(file: string, project: ProjectData): string {
  if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) return 'Test';
  if (project.roles[file]?.kind === 'page' || project.roles[file]?.kind === 'route' || project.roles[file]?.kind === 'layout') return 'Route';
  if (file.includes('/components/')) return 'Component';
  if (file.includes('/hooks/')) return 'Hook';
  if (file.includes('/context/')) return 'Context';
  if (file.includes('/services/') || file.includes('/api/')) return 'Service';
  return 'Module';
}

const columns: Record<string, number> = { Route: 0, Component: 1, Hook: 2, Context: 2, Service: 3, Test: 4, Module: 3 };

export function buildGraphView(project: ProjectData, selectedFile: string | null, changedFiles: string[]): { nodes: ModuleNode[]; edges: Edge[] } {
  const focus = selectedFile && project.impacts[selectedFile] ? selectedFile : changedFiles.find(file => project.impacts[file]) ?? null;
  const impact = focus ? project.impacts[focus] : undefined;
  const direct = new Set(impact?.directDependents ?? []);
  const transitive = new Set(impact?.transitiveDependents ?? []);
  const changed = new Set(changedFiles);
  const pathEdges = new Set<string>();
  for (const item of impact?.dependencyPaths ?? []) for (let i = 0; i < item.path.length - 1; i++) pathEdges.add(`${item.path[i]}|${item.path[i + 1]}`);
  const counts = new Map<number, number>();
  const nodes: ModuleNode[] = project.files.map(file => {
    const kind = category(file, project); const col = columns[kind] ?? 3;
    const row = counts.get(col) ?? 0; counts.set(col, row + 1);
    const tone: ModuleTone = file === focus ? 'selected' : direct.has(file) ? 'direct' : transitive.has(file) ? 'transitive' : changed.has(file) ? 'changed' : 'muted';
    const parts = file.split('/');
    return { id: file, type: 'module', position: { x: col * 285, y: row * 112 }, data: { file, label: parts.at(-1)!, subtitle: parts.slice(0, -1).join('/') || '/', category: kind, tone }, draggable: false };
  });
  const edges: Edge[] = project.edges.map((edge, index) => {
    const highlighted = pathEdges.has(`${edge.from}|${edge.to}`);
    return { id: `${edge.from}|${edge.to}|${edge.kind}|${index}`, source: edge.from, target: edge.to, type: 'smoothstep', animated: highlighted, label: edge.kind === 'next-layout' ? 'layout' : undefined,
      style: { stroke: highlighted ? '#46d5c4' : '#344253', strokeWidth: highlighted ? 2.4 : 1.3, opacity: focus && !highlighted ? 0.32 : 0.72 },
      labelStyle: { fill: '#7e91a5', fontSize: 10 },
    };
  });
  return { nodes, edges };
}
