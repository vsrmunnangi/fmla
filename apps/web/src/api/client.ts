import type { EvidencePackage } from '@contracts/evidence-package';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_FIXTURE = import.meta.env.VITE_USE_FIXTURE === 'true';

const TOKEN_KEY = 'fmla_dev_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The `claims` table row (§5) plus the api's own open-exception-count join — this isn't
 * part of packages/contracts (only EvidencePackage/Exception/EvidenceField are, per §4),
 * since the console's list view is api's own read shape, not the processor-produced
 * read-model. */
export interface ClaimListRow {
  id: string;
  claimant: string;
  employer: string;
  type: string;
  leaveType: string | null;
  status: string;
  assignee: string | null;
  updatedAt: string;
  openExceptions: number | null;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // FormData sets its own multipart boundary — don't override it.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function listClaims(status?: string): Promise<ClaimListRow[]> {
  if (USE_FIXTURE) return fixtureClaims(status);
  return authedFetch(`/claims${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

export async function getClaim(claimId: string): Promise<ClaimListRow> {
  if (USE_FIXTURE) return fixtureClaim(claimId);
  return authedFetch(`/claims/${encodeURIComponent(claimId)}`);
}

/** GET /categories — mirrors apps/api/src/common/categories.ts, which mirrors
 * services/processor/categories/*.py. Drives the "new claim" category picker and the
 * per-category upload-doc-type dropdown, instead of a hardcoded list that can drift. */
export interface DocTypeInfo {
  type: string;
  label: string;
}
export interface CategoryInfo {
  key: string;
  label: string;
  docTypes: DocTypeInfo[];
}

// Only used in fixture mode (no live api to ask) — kept in sync by hand with
// apps/api/src/common/categories.ts, same as everywhere else this config is mirrored.
const FIXTURE_CATEGORIES: CategoryInfo[] = [
  {
    key: 'FMLA', label: 'FMLA',
    docTypes: [
      { type: 'WH-380-E', label: "WH-380-E — Certification of Health Care Provider (Employee's Own Condition)" },
      { type: 'ProviderLetter', label: 'Provider Letter' },
    ],
  },
  { key: 'WORKERS_COMP', label: "Workers' Compensation", docTypes: [{ type: 'FirstReportOfInjury', label: 'First Report of Injury' }] },
  { key: 'ADA', label: 'ADA', docTypes: [{ type: 'AccommodationRequest', label: 'Accommodation Request' }] },
];

export async function getCategories(): Promise<CategoryInfo[]> {
  if (USE_FIXTURE) return FIXTURE_CATEGORIES;
  return authedFetch('/categories');
}

export async function createClaim(dto: {
  claimant: string;
  employer: string;
  type: string;
  leaveType?: string;
}): Promise<ClaimListRow> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode is read-only — point VITE_API_URL at a real api to create claims');
  return authedFetch('/claims', { method: 'POST', body: JSON.stringify(dto) });
}

/** POST /claims/:id/documents (§8) — the upload that actually drives the pipeline:
 * PROCESSING -> processor call -> AWAITING_REVIEW (or FAILED). `type` must match one of
 * the checklists in services/processor/rules/checklists.py (e.g. "WH-380-E"). */
export async function uploadDocument(claimId: string, type: string, file: File): Promise<void> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode is read-only — point VITE_API_URL at a real api to upload');
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  await authedFetch(`/claims/${encodeURIComponent(claimId)}/documents`, { method: 'POST', body: form });
}

export async function getPackage(claimId: string): Promise<EvidencePackage> {
  if (USE_FIXTURE) return fixturePackage(claimId);
  return authedFetch(`/claims/${encodeURIComponent(claimId)}/package`);
}

export async function certify(claimId: string): Promise<void> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode is read-only — point VITE_API_URL at a real api to certify');
  await authedFetch(`/claims/${encodeURIComponent(claimId)}/certify`, { method: 'POST' });
}

export async function requestInfo(claimId: string): Promise<void> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode is read-only');
  await authedFetch(`/claims/${encodeURIComponent(claimId)}/request-info`, { method: 'POST' });
}

export async function deny(claimId: string): Promise<void> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode is read-only');
  await authedFetch(`/claims/${encodeURIComponent(claimId)}/deny`, { method: 'POST' });
}

/** GET /admin/overview (role: senior-examiner, auditor) — read-only operational overview
 * across all claims, not part of §8's route table (same reasoning as GET /claims/:id). */
export interface AdminOverview {
  claimsByStatus: Record<string, number>;
  totalDocuments: number;
  exceptionsByType: Record<string, number>;
  failedClaims: { id: string; claimant: string; employer: string; updatedAt: string }[];
  recentActivity: { claimId: string; actor: string; fromStatus: string | null; toStatus: string; at: string }[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (USE_FIXTURE) throw new ApiError(0, 'fixture mode has no admin overview — point VITE_API_URL at a real api');
  return authedFetch('/admin/overview');
}

// --- fixture mode (VITE_USE_FIXTURE=true): renders off seed/*.json, no live api needed ---

async function fixtureClaims(status?: string): Promise<ClaimListRow[]> {
  const rows = await fetch('/fixtures/claims.seed.json').then((r) => r.json());
  const mapped: ClaimListRow[] = rows.map((c: any) => ({
    ...c,
    updatedAt: new Date().toISOString(),
    openExceptions: c.status === 'AWAITING_REVIEW' ? 4 : null,
  }));
  return status ? mapped.filter((c) => c.status === status) : mapped;
}

async function fixtureClaim(claimId: string): Promise<ClaimListRow> {
  const rows = await fixtureClaims();
  const row = rows.find((c) => c.id === claimId);
  if (!row) throw new ApiError(404, `no such claim: ${claimId}`);
  return row;
}

async function fixturePackage(claimId: string): Promise<EvidencePackage> {
  const claim = await fixtureClaim(claimId);
  if (claim.status !== 'AWAITING_REVIEW') {
    // matches the real api: no package exists yet for a claim still awaiting its first
    // (or a re-)upload — demonstrates the upload panel in fixture mode too.
    throw new ApiError(404, `no package for claim ${claimId} yet`);
  }
  const pkg = await fetch('/fixtures/package.fixture.json').then((r) => r.json());
  return { ...pkg, claimId };
}
