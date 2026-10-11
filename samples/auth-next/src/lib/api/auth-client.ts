import type { Session } from '../auth-contract';

export async function fetchSession(): Promise<Session | null> {
  const response = await fetch('/api/session');
  if (!response.ok) throw new Error('Session request failed');
  return (await response.json()) as Session | null;
}
