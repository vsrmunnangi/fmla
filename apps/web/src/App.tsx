import { useState } from 'react';
import { AuthProvider } from './api/AuthContext';
import { AppHeader } from './components/AppHeader';
import { ConsolePage } from './pages/ConsolePage';
import { EvidencePackagePage } from './pages/EvidencePackagePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

type View = { page: 'console' } | { page: 'claim'; claimId: string } | { page: 'admin' };

export function App() {
  const [view, setView] = useState<View>({ page: 'console' });
  const openClaim = (claimId: string) => setView({ page: 'claim', claimId });

  return (
    <AuthProvider>
      <div style={{ fontFamily: 'system-ui, sans-serif', color: '#111827', minHeight: '100vh', background: '#f8fafc' }}>
        <AppHeader
          activePage={view.page}
          onNavigateClaims={() => setView({ page: 'console' })}
          onNavigateAdmin={() => setView({ page: 'admin' })}
        />
        {view.page === 'claim' && <EvidencePackagePage claimId={view.claimId} onBack={() => setView({ page: 'console' })} />}
        {view.page === 'admin' && <AdminDashboardPage onOpenClaim={openClaim} />}
        {view.page === 'console' && <ConsolePage onOpenClaim={openClaim} />}
      </div>
    </AuthProvider>
  );
}
