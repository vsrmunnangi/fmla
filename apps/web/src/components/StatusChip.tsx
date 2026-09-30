const COLORS: Record<string, string> = {
  UPLOADED: '#6b7280',
  PROCESSING: '#2563eb',
  AWAITING_REVIEW: '#d97706',
  CERTIFIED: '#16a34a',
  MORE_INFO_REQUESTED: '#d97706',
  DENIED: '#dc2626',
  FAILED: '#dc2626',
};

export function StatusChip({ status }: { status: string }) {
  const color = COLORS[status] ?? '#6b7280';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: color,
        whiteSpace: 'nowrap',
      }}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}
