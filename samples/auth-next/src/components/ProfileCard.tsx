'use client';

import { useAuth } from '@/src/hooks/useAuth';

export function ProfileCard() {
  const { session, loading } = useAuth();
  if (loading) return <p>Loading profile…</p>;
  return <section><h2>Profile</h2><p>{session?.displayName ?? 'Guest'}</p></section>;
}
