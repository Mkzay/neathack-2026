import { NextResponse } from 'next/server';
import { getRunManager } from '../../../src/web/server';
import { acceptsLocalRequest } from '../../../src/web/request-policy';
import type { RunStart } from '../../../src/web/run-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!acceptsLocalRequest(request, true)) return NextResponse.json({ error: 'Local same-origin access only' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid investigation selection' }, { status: 400 });
  const value = body as Record<string, unknown>;
  if (!['auth-regression', 'working-tree'].includes(String(value.scenario)) || !['unstaged', 'staged'].includes(String(value.diff)) || Object.keys(value).sort().join(',') !== 'diff,scenario') return NextResponse.json({ error: 'Invalid investigation selection' }, { status: 400 });
  try {
    const id = getRunManager().start(value as RunStart);
    return NextResponse.json({ id }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'An investigation is already active' }, { status: 409 });
  }
}
