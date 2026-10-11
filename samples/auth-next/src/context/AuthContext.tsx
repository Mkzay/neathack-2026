'use client';

import { createContext } from 'react';
import type { Session } from '@/src/lib/auth-contract';

export const AuthContext = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
