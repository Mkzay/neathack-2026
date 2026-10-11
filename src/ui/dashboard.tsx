'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type NodeProps } from '@xyflow/react';
import type { ProjectData } from '../web/project-data';
import type { RunSnapshot, TimelineEvent } from '../web/run-manager';
import type { CheckResult } from '../agent/verification';
import { buildGraphView, type ModuleNode } from './graph-model';

function ModuleCard({ data }: NodeProps<ModuleNode>) {
  const initials: Record<string, string> = { Route: 'R', Component: 'C', Hook: 'H', Context: 'P', Service: 'S', Test: 'T', Module: 'M' };
  return <div className={`module-card tone-${data.tone}`} title={data.file}>
    <Handle type="source" position={Position.Right} className="module-handle" />
    <div className={`module-icon kind-${data.category.toLowerCase()}`}>{initials[data.category]}</div>
    <div className="module-copy"><span className="module-kind">{data.category}</span><strong>{data.label}</strong><small>{data.subtitle}</small></div>
    <Handle type="target" position={Position.Left} className="module-handle" />
  </div>;
}
const nodeTypes = { module: ModuleCard };

type TreeNode = { name: string; path: string; children: TreeNode[]; file: boolean };
function fileTree(files: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [], file: false };
  for (const file of files) {
    let cursor = root; let current = '';
    for (const [index, part] of file.split('/').entries()) {
      current = current ? `${current}/${part}` : part;
      let child = cursor.children.find(item => item.name === part);
      if (!child) { child = { name: part, path: current, children: [], file: index === file.split('/').length - 1 }; cursor.children.push(child); }
      cursor = child;
    }
  }
  const sort = (nodes: TreeNode[]) => { nodes.sort((a, b) => Number(a.file) - Number(b.file) || a.name.localeCompare(b.name)); nodes.forEach(node => sort(node.children)); };
  sort(root.children); return root.children;
}

function ExplorerBranch({ nodes, depth, selected, changed, onSelect }: { nodes: TreeNode[]; depth: number; selected: string | null; changed: Set<string>; onSelect: (file: string) => void }) {
  return <>{nodes.map(node => node.file ? <button key={node.path} className={`tree-file ${selected === node.path ? 'is-selected' : ''}`} style={{ paddingLeft: 16 + depth * 17 }} onClick={() => onSelect(node.path)} title={node.path}>
    <span className="file-mark">{node.name.endsWith('.tsx') ? '◫' : node.name.endsWith('.test.ts') ? '◇' : '⌁'}</span><span className="truncate">{node.name}</span>{changed.has(node.path) && <span className="changed-dot" />}
  </button> : <div key={node.path}><div className="tree-folder" style={{ paddingLeft: 16 + depth * 17 }}><span>⌄</span><span>{node.name}</span></div><ExplorerBranch nodes={node.children} depth={depth + 1} selected={selected} changed={changed} onSelect={onSelect} /></div>)}</>;
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const data = event.data as Record<string, unknown> | undefined;
  const result = event.type === 'verification_result' ? data as CheckResult | undefined : undefined;
  const status = result?.status;
  return <div className={`timeline-item event-${event.type}`}>
    <span className={`event-indicator ${status ? `result-${status}` : ''}`} />
    <div className="timeline-content"><div className="timeline-top"><span className="event-name">{event.name?.replaceAll('_', ' ') || event.type.replaceAll('_', ' ')}</span><time>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>
      <p>{event.summary}</p>
      {result && <div className="result-line"><span>Exit {result.exitCode ?? '—'}</span><span>{result.durationMs} ms</span>{result.truncated && <span>Output clipped</span>}</div>}
      {result && Boolean(result.stdout || result.stderr) && <button className="text-action" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide output' : 'View output'} <span>{expanded ? '⌃' : '⌄'}</span></button>}
      {expanded && result && <pre className="event-output">{[result.stdout, result.stderr].filter(Boolean).join('\n')}</pre>}
    </div>
  </div>;
}

function ReportView({ run }: { run: RunSnapshot | null }) {
  const report = run?.report;
  if (!report) return <div className="empty-report"><div className="empty-glyph">◎</div><h2>No report yet</h2><p>Run an investigation to see verified impact paths, check outcomes, and a grounded assessment.</p></div>;
  const failed = report.checks.filter(check => check.status === 'failed');
  const passed = report.checks.filter(check => check.status === 'passed');
  const download = () => { const blob = new Blob([report.markdown], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `impactgraph-${report.id}.md`; link.click(); URL.revokeObjectURL(url); };
  return <div className="report-page">
    <div className="report-heading"><div><span className="eyebrow">INVESTIGATION REPORT · {report.id.slice(0, 8)}</span><h2>Change impact assessment</h2><p>Evidence from the trusted sample, its dependency graph, and approved checks.</p><p className="report-usage">{report.model} · {report.usage.promptTokens + report.usage.completionTokens} tokens · {report.usage.costUsd === null ? 'cost unavailable' : `$${report.usage.costUsd.toFixed(6)}`} · {report.stopReason.replaceAll('_', ' ')}</p></div><div className="report-actions"><button className="secondary-button" onClick={() => navigator.clipboard.writeText(report.markdown)}>Copy Markdown</button><button className="secondary-button" onClick={download}>Download ↓</button></div></div>
    <div className="report-metrics"><div><span>CHANGED FILES</span><strong>{report.changedFiles.length}</strong></div><div><span>AFFECTED MODULES</span><strong>{report.affectedModules.length}</strong></div><div><span>FAILED CHECKS</span><strong className={failed.length ? 'danger-text' : ''}>{failed.length}</strong></div><div><span>PASSED CHECKS</span><strong className="success-text">{passed.length}</strong></div></div>
    <div className="assessment-card"><span className="eyebrow">FINAL ASSESSMENT</span><p>{report.finalAssessment}</p></div>
    <div className="report-grid"><section className="report-card"><h3>Changed files</h3>{report.changedFiles.length ? report.changedFiles.map(file => <div className="path-row" key={file}><span className="changed-dot" /><code>{file}</code></div>) : <p className="muted">No tracked changes were found.</p>}</section><section className="report-card"><h3>Verification outcomes</h3>{report.checks.length ? report.checks.map(check => <div className="check-row" key={check.id}><span className={`status-pill status-${check.status}`}>{check.status}</span><strong>{check.id}</strong><small>exit {check.exitCode ?? '—'}</small></div>) : <p className="muted">No check was run.</p>}</section></div>
    <section className="report-card"><h3>Dependency evidence</h3>{report.dependencyPaths.length ? report.dependencyPaths.map(item => <div className="evidence-row" key={item.file}><span>{item.file}</span><code>{item.path.join(' → ')}</code></div>) : <p className="muted">No dependency path was confirmed.</p>}</section>
    <div className="report-grid"><section className="report-card"><h3>Confirmed findings</h3>{report.confirmedFindings.length ? report.confirmedFindings.map((item, i) => <p className="finding" key={i}><span className="finding-dot" />{item}</p>) : <p className="muted">No failure was confirmed by verification.</p>}</section><section className="report-card"><h3>Potential risks</h3>{report.potentialRisks.map((item, i) => <p className="risk" key={i}>{item}</p>)}</section></div>
    <div className="report-grid"><section className="report-card"><h3>Follow-up investigations</h3>{report.followUps.length ? report.followUps.map((item, i) => <p className="risk" key={i}>{item.replaceAll('_', ' ')}</p>) : <p className="muted">No follow-up tool call was made.</p>}</section><section className="report-card"><h3>Agent hypotheses</h3>{report.hypotheses.length ? report.hypotheses.map((item, i) => <p className="risk" key={i}>{item}</p>) : <p className="muted">No structured model hypothesis was returned.</p>}</section></div>
    <section className="report-card"><h3>Unverified assumptions & limitations</h3>{[...report.unverifiedAssumptions, ...report.limitations].map((item, i) => <p className="risk" key={i}>{item}</p>)}</section>
  </div>;
}

export function Dashboard() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectError, setProjectError] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>('src/hooks/useAuth.ts');
  const [page, setPage] = useState<'architecture' | 'report'>('architecture');
  const [scenario, setScenario] = useState<'auth-regression' | 'working-tree'>('auth-regression');
  const [diff, setDiff] = useState<'unstaged' | 'staged'>('unstaged');
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { fetch('/api/project', { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Unable to load the trusted sample'); return response.json() as Promise<ProjectData>; }).then(setProject).catch(error => setProjectError(error.message)); }, []);
  const refreshRun = useCallback(async (id: string) => { const response = await fetch(`/api/investigations/${id}`, { cache: 'no-store' }); if (!response.ok) throw new Error('Unable to load investigation progress'); setRun(await response.json() as RunSnapshot); }, []);
  useEffect(() => { if (!runId || ['completed', 'failed', 'cancelled'].includes(run?.status ?? '')) return; let active = true; const tick = () => refreshRun(runId).catch(() => { if (active) setActionError('Progress connection interrupted. Local investigation may still be running.'); }); tick(); const timer = setInterval(() => { if (active) tick(); }, 900); return () => { active = false; clearInterval(timer); }; }, [runId, run?.status, refreshRun]);
  const changesFromEvents = [...(run?.events ?? [])].reverse().find(event => event.type === 'git_diff')?.data as { path: string; status: string }[] | undefined;
  const changedFiles = changesFromEvents?.map(item => item.path) ?? run?.report?.changedFiles ?? project?.changes.map(item => item.path) ?? [];
  const changed = new Set(changedFiles);
  const graph = project ? buildGraphView(project, selectedFile, changedFiles) : { nodes: [], edges: [] };
  const impact = selectedFile ? project?.impacts[selectedFile] : undefined;
  const running = run?.status === 'running' || run?.status === 'awaiting_approval' || run?.status === 'cancelling';
  const start = async () => { setActionBusy(true); setActionError(''); try { const response = await fetch('/api/investigations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario, diff }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to start investigation'); setRunId(payload.id); setRun(null); setPage('architecture'); await refreshRun(payload.id); } catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to start investigation'); } finally { setActionBusy(false); } };
  const decide = async (decision: 'approve' | 'deny') => { if (!runId || !run?.pendingApproval || actionBusy) return; setActionBusy(true); setActionError(''); try { const response = await fetch(`/api/investigations/${runId}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: run.pendingApproval.token, decision }) }); if (!response.ok) throw new Error('Approval is no longer pending'); await refreshRun(runId); } catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to submit decision'); } finally { setActionBusy(false); } };
  const cancel = async () => { if (!runId) return; setActionBusy(true); try { await fetch(`/api/investigations/${runId}/cancel`, { method: 'POST' }); await refreshRun(runId); } finally { setActionBusy(false); } };
  const tree = useMemo(() => fileTree(project?.files ?? []), [project]);
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-symbol"><span /> <span /> <span /></div><div><strong>ImpactGraph</strong><small>ARCHITECTURE INTELLIGENCE</small></div></div>
      <div className="sidebar-divider" />
      <div className="sidebar-caption">WORKSPACE</div><div className="project-switch"><span className="project-avatar">N</span><span><strong>Auth Next Sample</strong><small>Trusted local project</small></span><span className="project-chevron">⌄</span></div>
      <div className="sidebar-caption nav-caption">NAVIGATION</div><button className={`nav-link ${page === 'architecture' ? 'active' : ''}`} onClick={() => { setPage('architecture'); setSidebarOpen(false); }}><span className="nav-icon">⌘</span> Architecture map <span className="nav-count">{project?.files.length ?? '—'}</span></button><button className={`nav-link ${page === 'report' ? 'active' : ''}`} onClick={() => { setPage('report'); setSidebarOpen(false); }}><span className="nav-icon">▤</span> Investigation report {run?.report && <span className="nav-dot" />}</button>
      <div className="sidebar-caption explorer-caption">PROJECT EXPLORER <span>{project?.files.length ?? 0} FILES</span></div>
      <div className="tree-list">{project ? <ExplorerBranch nodes={tree} depth={0} selected={selectedFile} changed={changed} onSelect={file => { setSelectedFile(file); setPage('architecture'); setSidebarOpen(false); }} /> : <div className="sidebar-loading">{projectError || 'Indexing source files…'}</div>}</div>
      <div className="sidebar-bottom"><div className="sidebar-caption">CURRENT CHANGES</div>{changedFiles.length ? changedFiles.map(file => <button key={file} className="change-file" onClick={() => { setSelectedFile(file); setPage('architecture'); }}><span className="changed-dot" /><span>{file.split('/').at(-1)}</span><small>M</small></button>) : <p>No tracked changes in sample. Use the prepared regression to investigate a real diff.</p>}<div className="sidebar-local"><span className="live-dot" /> LOCAL-FIRST <small>·</small> TRUSTED REPOSITORIES</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle project explorer">☰</button><div className="breadcrumb">Workspace <span>/</span> Auth Next Sample <span>/</span> <strong>{page === 'architecture' ? 'Architecture' : 'Report'}</strong></div><div className="topbar-right"><span className="runtime-pill"><span className="live-dot" /> LOCAL RUNTIME</span><span className="top-avatar">IG</span></div></header>
      <div className="workspace-header"><div><span className="eyebrow">IMPACT INTELLIGENCE / 01</span><h1>{page === 'architecture' ? 'Architecture map' : 'Investigation report'}</h1><p>{page === 'architecture' ? 'Trace dependencies. See what a change could reach.' : 'A grounded view of changes, verification, and remaining risk.'}</p></div><div className="header-stat"><span>INDEXED MODULES</span><strong>{project?.files.length ?? '—'}</strong><small>{project?.edges.length ?? 0} dependency edges</small></div></div>
      {page === 'architecture' ? <div className="architecture-content"><div className="map-toolbar"><div className="map-title"><span className="map-mark">▦</span><strong>Dependency graph</strong><span className="toolbar-divider" /><small>Arrows point to imported dependencies</small></div><div className="map-legend"><span><i className="legend-selected" /> Selected</span><span><i className="legend-direct" /> Direct</span><span><i className="legend-transitive" /> Indirect</span></div></div>
        <div className="graph-wrap">{project ? <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedFile(node.id)} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.3} maxZoom={1.6} nodesConnectable={false} elementsSelectable><Background color="#263344" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={node => { const tone = (node.data as ModuleNode['data']).tone; return tone === 'selected' ? '#2dd4bf' : tone === 'direct' ? '#93b8ff' : '#3c4b60'; }} /></ReactFlow> : <div className="graph-empty">{projectError || 'Building architecture graph…'}</div>}</div>
        <div className="impact-panel"><div className="impact-heading"><span className="eyebrow">FILE INSPECTOR</span><strong>{selectedFile || 'Select a module'}</strong><small>{impact ? `${impact.directDependents.length} direct · ${impact.transitiveDependents.length} indirect dependents` : 'Select any graph node or file'}</small></div><div className="impact-body">{impact ? <><div className="impact-route"><span>Potentially affected routes</span><strong>{impact.potentiallyAffectedRoutes.length ? impact.potentiallyAffectedRoutes.join('  ·  ') : 'None identified'}</strong></div><div className="impact-paths"><span>Dependency paths</span>{impact.dependencyPaths.length ? impact.dependencyPaths.slice(0, 5).map(item => <code key={item.file}>{item.path.join(' → ')}</code>) : <small>No reverse dependents found.</small>}{impact.dependencyPaths.length > 5 && <small>+{impact.dependencyPaths.length - 5} more paths in the analyzer report</small>}</div></> : null}</div></div>
      </div> : <ReportView run={run} />}
    </main>
    <aside className="agent-panel"><div className="agent-heading"><div className="agent-title"><span className="agent-avatar">✳</span><div><strong>Agent investigation</strong><small>DeepSeek · OpenRouter</small></div></div><span className={`run-status ${run?.status || 'idle'}`}>{run?.status?.replaceAll('_', ' ') || 'Idle'}</span></div>
      <div className="agent-scroll"><div className="investigate-card"><div className="investigate-card-header"><span className="eyebrow">NEW INVESTIGATION</span><span>01 / 02</span></div><h2>Investigate a change</h2><p>Follow real Git changes through the architecture graph, then let the agent choose checks.</p><label>CHANGE SOURCE<select value={scenario} onChange={event => setScenario(event.target.value as typeof scenario)} disabled={running}><option value="auth-regression">Prepared auth regression</option><option value="working-tree">Working sample Git diff</option></select></label>{scenario === 'working-tree' && <label>DIFF TYPE<select value={diff} onChange={event => setDiff(event.target.value as typeof diff)} disabled={running}><option value="unstaged">Unstaged</option><option value="staged">Staged</option></select></label>}<button className="primary-button" onClick={start} disabled={running || actionBusy}>{running ? 'Investigation running…' : 'Investigate changes'}<span>↗</span></button>{running && <button className="cancel-button" onClick={cancel} disabled={actionBusy}>Cancel investigation</button>}<div className="scope-note"><span>◇</span> Every verification command requires your approval.</div></div>
      {run?.pendingApproval && <div className="approval-card" role="alert"><div className="approval-top"><span className="approval-icon">!</span><strong>Approval required</strong></div><p>The agent proposes a reviewed verification check. It will run only if you approve this request.</p><dl><dt>CHECK</dt><dd>{run.pendingApproval.check.id} · {run.pendingApproval.check.description}</dd><dt>EXECUTABLE</dt><dd><code>{run.pendingApproval.check.executable}</code></dd><dt>ARGUMENTS</dt><dd><code>{run.pendingApproval.check.args.join(' ')}</code></dd><dt>WORKING DIRECTORY</dt><dd><code>{run.pendingApproval.check.cwd}</code></dd></dl><div className="approval-actions"><button className="deny-button" onClick={() => decide('deny')} disabled={actionBusy}>Deny</button><button className="approve-button" onClick={() => decide('approve')} disabled={actionBusy}>Approve check</button></div></div>}
      {actionError && <div className="error-banner" role="alert">{actionError}</div>}{run?.status === 'failed' && <div className="error-banner" role="alert">{run.error || 'Investigation failed. The application is still available.'}</div>}
      <div className="timeline-heading"><div><span className="eyebrow">LIVE ACTIVITY</span><h3>Investigation timeline</h3></div><span>{run?.events.length ?? 0} EVENTS</span></div><div className="timeline">{run?.events.length ? run.events.map(event => <TimelineItem key={event.id} event={event} />) : <div className="timeline-empty"><span>⌁</span><strong>Waiting for an investigation</strong><p>Real agent actions will appear here as they happen.</p></div>}</div>
      </div><div className="agent-footer"><span className="live-dot" /> Local execution record {run?.report ? 'saved' : 'ready'} <span className="footer-shield">◇ Bounded access</span></div>
    </aside>
  </div>;
}
