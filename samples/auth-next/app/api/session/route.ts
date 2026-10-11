import { cookies } from 'next/headers';
import { getSessionFromToken } from '@/src/lib/services/session';

export async function GET() {
  const cookieStore = await cookies();
  return Response.json(getSessionFromToken(cookieStore.get('demo-session')?.value));
}
