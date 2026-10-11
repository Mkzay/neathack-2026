import { NextResponse } from 'next/server';
import { getRunManager } from '../../../../../src/web/server';
import { acceptsLocalRequest } from '../../../../../src/web/request-policy';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!acceptsLocalRequest(request, true)) return NextResponse.json({ error: 'Local same-origin access only' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  const value = body as Record<string, unknown>;
  if (typeof value.token !== 'string' || !['approve', 'deny'].includes(String(value.decision)) || Object.keys(value).sort().join(',') !== 'decision,token') return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  const { id } = await context.params;
  if (!getRunManager().decide(id, value.token, value.decision as 'approve' | 'deny')) return NextResponse.json({ error: 'Approval is no longer pending' }, { status: 409 });
  return NextResponse.json({ accepted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
