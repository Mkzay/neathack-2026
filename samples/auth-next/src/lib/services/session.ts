import type { Session } from '../auth-contract';

export function getSessionFromToken(token: string | undefined): Session | null {
  return token === 'demo-token' ? { userId: 'demo-user', displayName: 'Demo User' } : null;
}
