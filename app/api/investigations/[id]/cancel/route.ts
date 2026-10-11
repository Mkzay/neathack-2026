import { NextResponse } from 'next/server';
import { getRunManager } from '../../../../../src/web/server';
import { acceptsLocalRequest } from '../../../../../src/web/request-policy';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!acceptsLocalRequest(request, true)) return NextResponse.json({ error: 'Local same-origin access only' }, { status: 403 });
  const { id } = await context.params;
  if (!getRunManager().cancel(id)) return NextResponse.json({ error: 'Investigation is not active' }, { status: 409 });
  return NextResponse.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
}
