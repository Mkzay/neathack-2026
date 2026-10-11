import type { ReactNode } from 'react';
import { AuthProvider } from '@/src/context/AuthProvider';
import { Header } from '@/src/components';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AuthProvider><Header />{children}</AuthProvider></body></html>;
}
