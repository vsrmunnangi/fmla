import { CSSProperties, useEffect, useState } from 'react';
import { ClaimListRow, listClaims } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { StatusChip } from '../components/StatusChip';
import { NewClaimForm } from '../components/NewClaimForm';
import { theme } from '../theme';

const STATUSES = [
  'UPLOADED', 'PROCESSING', 'AWAITING_REVIEW', 'CERTIFIED', 'MORE_INFO_REQUESTED', 'DENIED', 'FAILED',
];

/** §9 Console: `GET /claims?status=`; rows show claimant, employer, status chip,
 * open-exception count; filters; clicking opens the package. */
export function ConsolePage({ onOpenClaim }: { onOpenClaim: (claimId: string) => void }) {
  const [claims, setClaims] = useState<ClaimListRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    setError(null);
    listClaims(statusFilter || undefined)
      .then(setClaims)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // re-fetch on sign-in/out too — the first mount can happen before a token exists.
  }, [statusFilter, user]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Claim queue</h1>
        <NewClaimForm onCreated={onOpenClaim} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          Status:{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p>Loading&hellip;</p>}
      {error && <p style={{ color: theme.danger }}>{error}</p>}

      {!loading && !error && (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: theme.brandBg }}>
                <th style={cellStyle}>Claimant</th>
                <th style={cellStyle}>Employer</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Open exceptions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr
                  key={c.id}
                  data-clickable
                  onClick={() => onOpenClaim(c.id)}
                  style={{ cursor: 'pointer', borderTop: `1px solid ${theme.border}` }}
                >
                  <td style={cellStyle}>{c.claimant}</td>
                  <td style={cellStyle}>{c.employer}</td>
                  <td style={cellStyle}><StatusChip status={c.status} /></td>
                  <td style={cellStyle}>{c.openExceptions ?? '—'}</td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr><td colSpan={4} style={{ ...cellStyle, textAlign: 'center', color: '#9ca3af' }}>No claims</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cellStyle: CSSProperties = { padding: '10px 14px' };
