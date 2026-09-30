import { ReactNode, useEffect, useState } from 'react';
import { AdminOverview, ApiError, getAdminOverview } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { StatusChip } from '../components/StatusChip';
import { theme } from '../theme';

const EXCEPTION_COLORS: Record<string, string> = {
  missing: theme.danger,
  unclear: theme.warn,
  conflict: theme.conflict,
  low_confidence: theme.muted,
};

/** Read-only operational overview across all claims (GET /admin/overview, role
 * senior-examiner|auditor) — claims by status, exceptions by type, FAILED claims flagged,
 * recent activity. Not a claim-decision surface — no actions happen here. */
export function AdminDashboardPage({ onOpenClaim }: { onOpenClaim: (claimId: string) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    setData(null);
    setError(null);
    getAdminOverview().then(setData).catch(setError);
    // re-fetch on sign-in/out too — the first mount can happen before a token exists,
    // and switching roles (e.g. examiner -> auditor) should retry, not stay on the old error.
  }, [user]);

  if (error) {
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        <p style={{ color: theme.danger }}>
          {forbidden ? 'Your role cannot view the admin dashboard (needs senior-examiner or auditor).' : String(error)}
        </p>
      </div>
    );
  }
  if (!data) return <div style={{ padding: 24 }}>Loading&hellip;</div>;

  const totalClaims = Object.values(data.claimsByStatus).reduce((a, b) => a + b, 0);
  const totalExceptions = Object.values(data.exceptionsByType).reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Admin overview</h1>
      <p style={{ color: theme.muted, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Read-only, across all claims. Not a decision surface.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title={`Claims by status (${totalClaims})`}>
          {Object.entries(data.claimsByStatus).length === 0 ? (
            <Empty />
          ) : (
            Object.entries(data.claimsByStatus).map(([status, count]) => (
              <BarRow key={status} label={<StatusChip status={status} />} count={count} max={totalClaims} color={theme.brand} labelWidth={190} />
            ))
          )}
        </Card>

        <Card title={`Exceptions by type (${totalExceptions})`}>
          {Object.entries(data.exceptionsByType).length === 0 ? (
            <Empty text="No exceptions across any claim." />
          ) : (
            Object.entries(data.exceptionsByType).map(([type, count]) => (
              <BarRow key={type} label={<span style={{ fontSize: 13 }}>{type}</span>} count={count} max={totalExceptions} color={EXCEPTION_COLORS[type] ?? theme.muted} />
            ))
          )}
        </Card>

        <Card title={`Failed claims (${data.failedClaims.length})`}>
          {data.failedClaims.length === 0 ? (
            <Empty text="No claims stuck in FAILED." />
          ) : (
            data.failedClaims.map((c) => (
              <div
                key={c.id}
                onClick={() => onOpenClaim(c.id)}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', fontSize: 13 }}
              >
                <span>{c.claimant} &middot; {c.employer} <span style={{ color: theme.muted }}>({c.id})</span></span>
                <span style={{ color: theme.muted }}>{new Date(c.updatedAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </Card>

        <Card title="Total documents processed">
          <div style={{ fontSize: 32, fontWeight: 700 }}>{data.totalDocuments}</div>
        </Card>

        <div style={{ gridColumn: '1 / -1' }}>
          <Card title="Recent activity">
            {data.recentActivity.length === 0 ? (
              <Empty text="No transitions yet." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: theme.muted, fontSize: 12 }}>
                    <th style={{ padding: '4px 8px' }}>Claim</th>
                    <th style={{ padding: '4px 8px' }}>Actor</th>
                    <th style={{ padding: '4px 8px' }}>Transition</th>
                    <th style={{ padding: '4px 8px' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((a, i) => (
                    <tr key={i} onClick={() => onOpenClaim(a.claimId)} style={{ borderTop: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                      <td style={{ padding: '6px 8px' }}>{a.claimId}</td>
                      <td style={{ padding: '6px 8px' }}>{a.actor}</td>
                      <td style={{ padding: '6px 8px' }}>{a.fromStatus ?? '—'} &rarr; {a.toStatus}</td>
                      <td style={{ padding: '6px 8px', color: theme.muted }}>{new Date(a.at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: '#fff', padding: 16 }}>
      <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3, color: theme.muted, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </div>
  );
}

function BarRow({ label, count, max, color, labelWidth = 140 }: { label: ReactNode; count: number; max: number; color: string; labelWidth?: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: labelWidth, flexShrink: 0, overflow: 'hidden' }}>{label}</div>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
      </div>
      <div style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{count}</div>
    </div>
  );
}

function Empty({ text = 'Nothing yet.' }: { text?: string }) {
  return <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>{text}</p>;
}
