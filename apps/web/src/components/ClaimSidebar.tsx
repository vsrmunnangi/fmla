import type { ReactNode } from 'react';
import type { EvidencePackage } from '@contracts/evidence-package';
import type { ClaimListRow } from '../api/client';
import { theme } from '../theme';

// "Evidence Package" is the only real destination in this v1 scaffold — the rest mirror
// the design reference's claim-level nav but don't lead anywhere yet.
const NAV_ITEMS = ['Evidence Package', 'Documents', 'Timeline', 'Tasks', 'Notes', 'Payments', 'Return to Work'];

export function ClaimSidebar({ claim }: { claim: ClaimListRow; claimSummary?: EvidencePackage['claim'] }) {
  // "Leave Type" (Intermittent/Continuous) is FMLA-specific vocabulary — showing it for a
  // Workers'-Comp or ADA claim (where it's always empty) doesn't mean anything, so it's
  // only shown for FMLA claims, and only once a value has actually been captured.
  const showLeaveType = claim.type === 'FMLA';

  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <nav style={{ marginBottom: 20 }}>
        {NAV_ITEMS.map((item) => {
          const active = item === 'Evidence Package';
          return (
            <div
              key={item}
              title={active ? undefined : 'not part of this v1 scaffold'}
              style={{
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 2,
                background: active ? theme.brandBg : 'transparent',
                color: active ? theme.brand : theme.muted,
                fontWeight: active ? 600 : 400,
                cursor: active ? 'default' : 'not-allowed',
              }}
            >
              {item}
            </div>
          );
        })}
      </nav>

      <SidebarPanel title="Claim Details">
        <Row label="Employer" value={claim.employer} />
        <Row label="Claim Type" value={claim.type} />
        {showLeaveType && <Row label="Leave Type" value={claim.leaveType ?? '—'} />}
      </SidebarPanel>

      <SidebarPanel title="Case Ownership">
        <Row label="Assignee" value={claim.assignee ?? 'Unassigned'} />
      </SidebarPanel>
    </div>
  );
}

function SidebarPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 12, marginBottom: 14, background: '#fff' }}>
      <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3, color: theme.muted, margin: '0 0 8px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 8 }}>
      <span style={{ color: theme.muted }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}
