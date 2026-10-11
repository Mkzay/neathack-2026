'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchSession } from '@/src/lib/api/auth-client';
import type { Session } from '@/src/lib/auth-contract';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchSession().then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}
