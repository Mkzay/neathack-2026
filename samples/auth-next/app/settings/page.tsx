'use client';

import dynamic from 'next/dynamic';

const SettingsPanel = dynamic(() => import('@/src/components/SettingsPanel'));

export default function SettingsPage() {
  return <main><h1>Settings</h1><SettingsPanel /></main>;
}
