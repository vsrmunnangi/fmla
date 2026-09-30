import { createContext, ReactNode, useContext, useState } from 'react';
import { clearToken, getToken, setToken } from './client';
import { decodeToken, DevTokenPayload } from './jwt';

interface AuthState {
  user: DevTokenPayload | null;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Single reactive source of truth for "who's signed in," so AuthBar's sign-in/out is
 * immediately reflected by every consumer (e.g. EvidencePackagePage's decision buttons) —
 * without this, each component only re-derives the user on its own next render. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DevTokenPayload | null>(() => {
    const token = getToken();
    return token ? decodeToken(token) : null;
  });

  const signIn = (token: string) => {
    setToken(token);
    setUser(decodeToken(token));
  };
  const signOut = () => {
    clearToken();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
