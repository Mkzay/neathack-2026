import path from 'node:path';
import { NextResponse } from 'next/server';
import { loadProjectData } from '../../../src/web/project-data';
import { acceptsLocalRequest } from '../../../src/web/request-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  if (!acceptsLocalRequest(request, false)) return NextResponse.json({ error: 'Local access only' }, { status: 403 });
  try {
    return NextResponse.json(loadProjectData(path.resolve(process.cwd(), 'samples/auth-next')), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to index the trusted sample' }, { status: 500 });
  }
}
