import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ImpactGraph — Architecture intelligence',
  description: 'Local-first architecture impact and verification for trusted Next.js projects.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
