'use client';

import Link from 'next/link';
import { useAuth } from '@/src/hooks/useAuth';

export function Header() {
  const { session, loading } = useAuth();
  return <header><nav><Link href="/">Home</Link> · <Link href="/dashboard">Dashboard</Link> · <Link href="/settings">Settings</Link></nav><p>{loading ? 'Checking session…' : session ? `Signed in as ${session.displayName}` : 'Signed out'}</p></header>;
}
