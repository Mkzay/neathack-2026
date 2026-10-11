'use client';

import { useAuth } from '@/src/hooks/useAuth';

export default function SettingsPanel() {
  const { session } = useAuth();
  return <p>{session ? `Settings for ${session.displayName}` : 'Sign in to see settings.'}</p>;
}
