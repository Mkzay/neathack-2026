import { NextResponse } from 'next/server';
import { getRunManager } from '../../../../src/web/server';
import { acceptsLocalRequest } from '../../../../src/web/request-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!acceptsLocalRequest(request, false)) return NextResponse.json({ error: 'Local access only' }, { status: 403 });
  const { id } = await context.params;
  const run = getRunManager().get(id);
  return run ? NextResponse.json(run, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Investigation not found' }, { status: 404 });
}
