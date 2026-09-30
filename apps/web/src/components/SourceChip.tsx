import type { Source } from '@contracts/evidence-field';

/** §9: "docId · p.page (deep-link to a PDF viewer with bbox highlight is a later refinement)." */
export function SourceChip({ source }: { source: Source | null | undefined }) {
  if (!source) return <span style={{ color: '#9ca3af', fontSize: 12 }}>&mdash;</span>;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'ui-monospace, monospace',
        color: '#374151',
        background: '#f3f4f6',
        border: '1px solid #e5e7eb',
      }}
      title="Deep-link to the source PDF with the bbox highlighted is a later refinement"
    >
      {source.docId} · p.{source.page}
    </span>
  );
}
