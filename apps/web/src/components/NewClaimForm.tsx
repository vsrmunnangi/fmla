import { FormEvent, useEffect, useState } from 'react';
import { ApiError, CategoryInfo, createClaim, getCategories } from '../api/client';

/** POST /claims (§8, role examiner|triage) — creates the claim shell (status UPLOADED) that
 * the upload panel on the evidence-package page then attaches documents to. Category list
 * comes from GET /categories, not a hardcoded free-text input, so a new category (see
 * apps/api/src/common/categories.ts) shows up here without a code change to this form. */
export function NewClaimForm({ onCreated }: { onCreated: (claimId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [claimant, setClaimant] = useState('');
  const [employer, setEmployer] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getCategories()
      .then((cats) => {
        setCategories(cats);
        setType((current) => current || cats[0]?.key || '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [open]);

  if (!open) {
    return <button onClick={() => setOpen(true)}>+ New claim</button>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const claim = await createClaim({ claimant, employer, type });
      onCreated(claim.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
    >
      <input placeholder="Claimant name" required value={claimant} onChange={(e) => setClaimant(e.target.value)} disabled={busy} />
      <input placeholder="Employer" required value={employer} onChange={(e) => setEmployer(e.target.value)} disabled={busy} />
      <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy || categories.length === 0}>
        {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <button type="submit" disabled={busy || !type}>Create</button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      {error && <p style={{ color: '#dc2626', fontSize: 13, width: '100%', margin: 0 }}>{error}</p>}
    </form>
  );
}
