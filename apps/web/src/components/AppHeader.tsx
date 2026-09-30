import { useState } from 'react';
import { useAuth } from '../api/AuthContext';
import { theme } from '../theme';

// Only "Claims" and "Admin" are real screens in this v1 scaffold — the rest are shown for
// the app-shell look of the design reference but are inert (title tooltip explains why).
const NAV_ITEMS = ['Home', 'Claims', 'Documents', 'Notes', 'Tasks', 'Calendar', 'Reports', 'Admin'] as const;

interface AppHeaderProps {
  activePage: 'console' | 'claim' | 'admin';
  onNavigateClaims: () => void;
  onNavigateAdmin: () => void;
}

/** Top nav + dev-only auth: paste a token minted by `apps/api/scripts/issue-dev-token.ts`
 * (§3's "dev JWT stub"). There's no in-browser login — minting a token needs
 * DEV_JWT_SECRET, which never reaches the client. */
export function AppHeader({ activePage, onNavigateClaims, onNavigateAdmin }: AppHeaderProps) {
  const { user, signIn, signOut } = useAuth();
  const [draft, setDraft] = useState('');

  const handlers: Partial<Record<(typeof NAV_ITEMS)[number], () => void>> = {
    Claims: onNavigateClaims,
    Admin: onNavigateAdmin,
  };
  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    (item === 'Claims' && (activePage === 'console' || activePage === 'claim')) || (item === 'Admin' && activePage === 'admin');

  return (
    <header style={{ background: theme.brand, color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px', height: 48 }}>
        <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>FMLA Evidence Console</strong>
        <nav style={{ display: 'flex', gap: 18, fontSize: 13 }}>
          {NAV_ITEMS.map((item) => {
            const onClick = handlers[item];
            const active = isActive(item);
            return (
              <span
                key={item}
                onClick={onClick}
                title={onClick ? undefined : 'not part of this v1 scaffold'}
                style={{
                  padding: '4px 0',
                  borderBottom: active ? '2px solid #fff' : '2px solid transparent',
                  fontWeight: active ? 600 : 400,
                  opacity: onClick ? 1 : 0.55,
                  cursor: onClick ? 'pointer' : 'not-allowed',
                }}
              >
                {item}
              </span>
            );
          })}
        </nav>
        <span style={{ flex: 1 }} />
        {user ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span>Signed in as <strong>{user.sub}</strong> ({user.role})</span>
            <button onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="paste dev token"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: 300 }}
            />
            <button onClick={() => { if (draft) { signIn(draft); setDraft(''); } }}>Sign in</button>
          </div>
        )}
      </div>
    </header>
  );
}
