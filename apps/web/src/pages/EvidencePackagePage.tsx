import { ReactNode, useEffect, useState } from 'react';
import type { EvidencePackage } from '@contracts/evidence-package';
import type { EvidenceField } from '@contracts/evidence-field';
import type { Exception } from '@contracts/exception';
import { ApiError, ClaimListRow, certify, deny, getClaim, getPackage, requestInfo } from '../api/client';
import { useAuth } from '../api/AuthContext';
import { StatusChip } from '../components/StatusChip';
import { SourceChip } from '../components/SourceChip';
import { UploadPanel } from '../components/UploadPanel';
import { ClaimSidebar } from '../components/ClaimSidebar';
import { StatRing } from '../components/StatRing';
import { theme } from '../theme';

const DECISION_ROLES = new Set(['examiner', 'senior-examiner']);
const UPLOADABLE_STATUSES = new Set(['UPLOADED', 'MORE_INFO_REQUESTED', 'FAILED']);

const EXCEPTION_PANELS: { type: Exception['type']; title: string; accent: string }[] = [
  { type: 'conflict', title: 'Conflicts requiring review', accent: theme.conflict },
  { type: 'missing', title: 'Missing information', accent: theme.danger },
  { type: 'unclear', title: 'Unclear', accent: theme.warn },
  { type: 'low_confidence', title: 'Low confidence', accent: theme.muted },
];

type Tab = 'evidence' | 'timeline';

/** §9 Evidence package: `GET /claims/:id/package`; evidence tables (value + confidence +
 * source chip), functional checks, document timeline, gap panels (missing / unclear /
 * conflict). Decision buttons call the transition endpoints; disabled unless the claim is
 * AWAITING_REVIEW and role permits (mirrors §6 — the server is the real gate).
 *
 * Layout/visual system follows a "one evidence package" design reference: a claim-level
 * sidebar, a stat strip with ring indicators, tabbed evidence content on the left, gap
 * panels pinned on the right. It deliberately stops at the v1 boundary (§1, §4.2,
 * invariant #4) — no cure drafting, no task/note/payment workspace (those sidebar/tab
 * items are shown for the app-shell look but are inert), just evidence -> gaps -> the
 * examiner's decision.
 *
 * Before the first document is uploaded (or after MORE_INFO_REQUESTED/FAILED), there is no
 * package yet — GET .../package 404s — so this also owns the upload interface (§8's
 * POST .../documents), not just the read-only view. */
export function EvidencePackagePage({ claimId, onBack }: { claimId: string; onBack: () => void }) {
  const [claim, setClaim] = useState<ClaimListRow | null>(null);
  const [pkg, setPkg] = useState<EvidencePackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('evidence');

  const load = () => {
    setError(null);
    getClaim(claimId).then(setClaim).catch((e) => setError(String(e)));
    getPackage(claimId)
      .then(setPkg)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setPkg(null); // no package yet — not an error, just an earlier claim state
        } else {
          setError(String(e));
        }
      });
  };

  const { user } = useAuth();
  // re-fetch on sign-in/out too — landing here unauthenticated, then signing in, should
  // retry rather than stay stuck on the earlier 401 (see AdminDashboardPage for the same fix).
  useEffect(load, [claimId, user]);

  const canDecide = !!user && DECISION_ROLES.has(user.role) && claim?.status === 'AWAITING_REVIEW';

  async function act(fn: (id: string) => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn(claimId);
      load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div style={{ padding: 24 }}><p style={{ color: theme.danger }}>{error}</p><button onClick={onBack}>&larr; Back</button></div>;
  if (!claim) return <div style={{ padding: 24 }}>Loading&hellip;</div>;

  const exceptionsByType = (t: Exception['type']) => pkg?.exceptions.filter((e) => e.type === t) ?? [];
  const fieldsByGroup = (groups: string[]) => pkg?.evidence.filter((f) => groups.includes(f.group)) ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <ClaimSidebar claim={claim} claimSummary={pkg?.claim} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <button onClick={onBack} style={{ marginBottom: 16 }}>&larr; Back to queue</button>

        {/* Claim header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, margin: 0 }}>Claim # {claim.id}</h1>
              <StatusChip status={claim.status} />
            </div>
            <p style={{ color: theme.muted, margin: '4px 0' }}>
              {claim.claimant} &middot; {claim.employer} &middot; {claim.type}
              {pkg && (
                <>
                  {' '}&middot; leave year {pkg.claim.leaveYear.start} &ndash; {pkg.claim.leaveYear.end}
                  {' '}&middot; {pkg.claim.fmlaBalance.usedWeeks}/{pkg.claim.fmlaBalance.totalWeeks} weeks used
                </>
              )}
            </p>
          </div>

          {pkg && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={!canDecide || busy}
                  onClick={() => act(certify)}
                  style={canDecide ? { background: theme.brand, color: '#fff', border: 'none' } : undefined}
                >
                  Certify
                </button>
                <button disabled={!canDecide || busy} onClick={() => act(requestInfo)}>Request info</button>
                <button disabled={!canDecide || busy} onClick={() => act(deny)}>Deny</button>
              </div>
              {!canDecide && claim.status === 'AWAITING_REVIEW' && (
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  {user ? 'your role cannot decide claims' : 'sign in as examiner/senior-examiner to decide'}
                </span>
              )}
            </div>
          )}
        </div>
        {actionError && <p style={{ color: theme.danger }}>{actionError}</p>}

        {UPLOADABLE_STATUSES.has(claim.status) && (
          <UploadPanel claimId={claimId} category={claim.type} onUploaded={load} />
        )}

        {!pkg && claim.status === 'PROCESSING' && (
          <p style={{ color: theme.muted }}>Processing&hellip; (OCR + rules + LLM validation running). Refresh in a moment.</p>
        )}
        {!pkg && !UPLOADABLE_STATUSES.has(claim.status) && claim.status !== 'PROCESSING' && (
          <p style={{ color: theme.muted }}>No evidence package yet.</p>
        )}

        {pkg && (
          <>
            <StatStrip pkg={pkg} />

            <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${theme.border}`, margin: '20px 0 16px' }}>
              <TabButton active={tab === 'evidence'} onClick={() => setTab('evidence')}>Evidence Summary</TabButton>
              <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>Document Timeline</TabButton>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
              {/* Left: tabbed content */}
              <div>
                {tab === 'evidence' ? (
                  <>
                    <EvidenceGroup title="Provider & Condition Evidence" fields={fieldsByGroup(['provider', 'condition'])} />
                    <EvidenceGroup title="Leave Evidence" fields={fieldsByGroup(['leave'])} />

                    <Section title="Functional checks">
                      {pkg.functionalChecks.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>None derived yet.</p>
                      ) : (
                        <table style={tableStyle}>
                          <thead>
                            <tr><th style={th}>Function</th><th style={th}>Provider statement</th><th style={th}>Effective period</th><th style={th}>Source</th></tr>
                          </thead>
                          <tbody>
                            {pkg.functionalChecks.map((fc, i) => (
                              <tr key={i} style={rowStyle}>
                                <td style={td}>{fc.function}</td>
                                <td style={td}>{fc.providerStatement ?? '—'}</td>
                                <td style={td}>{fc.effectivePeriod ?? '—'}</td>
                                <td style={td}><SourceChip source={fc.source} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </Section>
                  </>
                ) : (
                  <Section title="Document timeline">
                    <DocumentTimeline documents={pkg.documents} />
                  </Section>
                )}
              </div>

              {/* Right: gaps requiring attention, most important first — visible regardless of tab */}
              <div style={{ position: 'sticky', top: 16 }}>
                {EXCEPTION_PANELS.map(({ type, title, accent }) => (
                  <GapPanel key={type} title={title} exceptions={exceptionsByType(type)} color={accent} />
                ))}
                {pkg.exceptions.length === 0 && (
                  <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: 12, fontSize: 13, color: '#166534' }}>
                    No gaps found — all required fields present and no conflicts detected.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? theme.brand : theme.muted,
        borderBottom: active ? `2px solid ${theme.brand}` : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function StatStrip({ pkg }: { pkg: EvidencePackage }) {
  const m = pkg.metrics;
  const completeness = m.fieldsExpected > 0 ? m.completenessPass / m.fieldsExpected : 0;
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatTile label="Documents" value={m.documents} />
        <StatTile label="Fields captured" value={`${m.fieldsCaptured}/${m.fieldsExpected}`} />
        <RingStatTile
          label="Completeness"
          value={`${m.completenessPass}/${m.fieldsExpected}`}
          fraction={completeness}
          color={m.completenessMissing > 0 ? theme.warn : theme.ok}
        />
        <StatTile label="Missing" value={m.completenessMissing} color={m.completenessMissing > 0 ? theme.danger : undefined} />
        <StatTile label="Conflicts" value={m.conflicts} color={m.conflicts > 0 ? theme.conflict : undefined} />
        <RingStatTile label="Confidence" value={`${Math.round(m.overallConfidence * 100)}%`} fraction={m.overallConfidence} color={theme.ok} />
      </div>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0' }}>
        Last run {new Date(pkg.generatedAt).toLocaleString()} &middot; {pkg.runId}
      </p>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '10px 16px', minWidth: 100, background: '#fff' }}>
      <div style={{ fontSize: 11, color: theme.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? '#111827' }}>{value}</div>
    </div>
  );
}

function RingStatTile({ label, value, fraction, color }: { label: string; value: string; fraction: number; color: string }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 16px', minWidth: 150, background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
      <StatRing fraction={fraction} color={color} size={40} />
      <div>
        <div style={{ fontSize: 11, color: theme.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function EvidenceGroup({ title, fields }: { title: string; fields: EvidenceField[] }) {
  if (fields.length === 0) return null;
  return (
    <Section title={title}>
      <table style={tableStyle}>
        <thead>
          <tr><th style={th}>Field</th><th style={th}>Value</th><th style={th}>Confidence</th><th style={th}>Status</th><th style={th}>Source</th></tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.fieldId} style={rowStyle}>
              <td style={td}>{f.label}</td>
              <td style={td}>{f.value ?? <em style={{ color: '#9ca3af' }}>none</em>}</td>
              <td style={td}>{f.confidence != null ? f.confidence.toFixed(2) : '—'}</td>
              <td style={td}><FieldStatusBadge status={f.status} /></td>
              <td style={td}><SourceChip source={f.source} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function FieldStatusBadge({ status }: { status?: string }) {
  const colors: Record<string, string> = { ok: theme.ok, unclear: theme.warn, low_confidence: theme.warn, missing: theme.danger };
  return <span style={{ fontSize: 12, color: colors[status ?? 'ok'] ?? theme.muted, fontWeight: 600 }}>{status}</span>;
}

function DocumentTimeline({ documents }: { documents: EvidencePackage['documents'] }) {
  if (documents.length === 0) return <p style={{ color: '#9ca3af', fontSize: 13 }}>No documents yet.</p>;
  const sorted = [...documents].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return (
    <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
      {sorted.map((d, i) => (
        <div key={d.docId} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 32, height: 1, background: theme.border }} />}
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', minWidth: 140, background: '#fff' }}>
            <div style={{ fontSize: 12, color: theme.muted }}>{d.receivedAt}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{d.type}</div>
            <div style={{ fontSize: 12, color: theme.muted }}>{d.docId} &middot; {d.pages}p &middot; {d.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GapPanel({ title, exceptions, color }: { title: string; exceptions: Exception[]; color: string }) {
  if (exceptions.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, color, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
        <span style={{ background: color, color: '#fff', borderRadius: 999, fontSize: 11, padding: '0 7px', fontWeight: 700 }}>
          {exceptions.length}
        </span>
      </h3>
      {exceptions.map((e) => (
        <div key={e.exceptionId} style={{ border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '10px 12px', marginBottom: 8, background: '#fff' }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{e.title}</div>
          <div style={{ fontSize: 13, color: '#374151', margin: '2px 0' }}>{e.detail}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {e.sources.map((s, i) => <SourceChip key={i} source={s} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.3, color: theme.muted, borderBottom: `1px solid ${theme.border}`, paddingBottom: 8, marginBottom: 10 }}>{title}</h2>
      {children}
    </div>
  );
}

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const };
const th = { textAlign: 'left' as const, padding: '6px 10px', borderBottom: `2px solid ${theme.border}`, fontSize: 12, color: theme.muted };
const td = { padding: '6px 10px', fontSize: 13 };
const rowStyle = { borderBottom: '1px solid #f3f4f6' };
