/** Hand-maintained mirror of services/processor/categories/*.py's registry — same
 * pattern as contracts.py being hand-written rather than generated (this is pipeline
 * config, not part of the EvidenceField/Exception/EvidencePackage contract in
 * packages/contracts). Source of truth for what a document type requires/how it's
 * extracted stays in the processor; this is just enough for api to validate `claims.type`
 * and for the web upload dropdown to offer the right doc types per category. */

export interface DocTypeInfo {
  type: string;
  label: string;
}

export interface CategoryInfo {
  key: string;
  label: string;
  docTypes: DocTypeInfo[];
}

export const CATEGORIES: CategoryInfo[] = [
  {
    key: 'FMLA',
    label: 'FMLA',
    docTypes: [
      { type: 'WH-380-E', label: "WH-380-E — Certification of Health Care Provider (Employee's Own Condition)" },
      { type: 'ProviderLetter', label: 'Provider Letter' },
    ],
  },
  {
    key: 'WORKERS_COMP',
    label: "Workers' Compensation",
    docTypes: [{ type: 'FirstReportOfInjury', label: 'First Report of Injury' }],
  },
  {
    key: 'ADA',
    label: 'ADA',
    docTypes: [{ type: 'AccommodationRequest', label: 'Accommodation Request' }],
  },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
