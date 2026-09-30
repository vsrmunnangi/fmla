import { FormEvent, useEffect, useState } from 'react';
import { ApiError, DocTypeInfo, getCategories, uploadDocument } from '../api/client';

/** POST /claims/:id/documents (§8) — this is what actually drives the pipeline: upload ->
 * PROCESSING -> processor call -> AWAITING_REVIEW/FAILED. Runs synchronously on the api
 * side (§8), so this can take a few seconds (OCR + the local LLM call).
 *
 * Doc-type options come from the claim's own category (GET /categories, filtered to
 * `category`) — not a hardcoded FMLA-only list — so a Workers'-Comp or ADA claim offers
 * its own document types instead of WH-380-E/ProviderLetter. */
export function UploadPanel({ claimId, category, onUploaded }: { claimId: string; category: string; onUploaded: () => void }) {
  const [docTypes, setDocTypes] = useState<DocTypeInfo[]>([]);
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories()
      .then((cats) => {
        const types = cats.find((c) => c.key === category)?.docTypes ?? [];
        setDocTypes(types);
        setType(types[0]?.type ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [category]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadDocument(claimId, type, file);
      setFile(null);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 24 }}
    >
      <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>Upload a document</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy || docTypes.length === 0}>
          {docTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !file || !type}>
          {busy ? 'Uploading & processing…' : 'Upload'}
        </button>
      </div>
      {busy && (
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          OCR + rules + LLM validation run synchronously — this can take a few seconds.
        </p>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{error}</p>}
    </form>
  );
}
