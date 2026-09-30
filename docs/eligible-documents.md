# Eligible documents by claim category

What documents this system can be pointed at, organized by claim category. For each
category: the real-world regulatory/industry picture (researched against primary sources,
not assumption — see Sources at the bottom), what's implemented today in
`services/processor/categories/`, and what a sensible next addition looks like.

"Eligible" means different things per category — FMLA has a small, closed, federally
defined set of forms; Workers' Comp and STD/LTD have no closed set at all, just a common
content pattern under dozens/hundreds of different form numbers; ADA has no form
requirement whatsoever. Each section says which situation it's in before listing anything,
so "how many are there" gets an honest answer instead of a number that implies more
standardization than actually exists.

---

## 1. FMLA

**Regulatory basis:** U.S. Department of Labor, Wage and Hour Division (WHD). Federal,
uniform nationwide — the one category here with a genuinely closed, numbered set of forms.

**Status:** ✅ implemented (`categories/fmla.py`), 🔲 not yet implemented.

| Form | Status | Purpose | Required fields (this system) |
|---|---|---|---|
| **WH-380-E** | ✅ | Certification of Health Care Provider for **Employee's own** serious health condition. The document a claimant's own doctor fills out. | `provider.name`, `condition.onset`, `condition.pathway`, `leave.type`, `leave.frequency`, `condition.nextTreatmentDate` |
| **ProviderLetter** | ✅ | Not a DOL form — a generic fallback for a free-text provider letter that doesn't fit a numbered form. Reuses WH-380-E's field set today (see note below). | `provider.name`, `condition.pathway`, `leave.type` |
| **WH-380-F** | 🔲 | Certification of Health Care Provider for a **family member's** serious health condition — same shape as WH-380-E, but the certifying provider is treating the claimant's family member, not the claimant. | *(proposed: same field set as WH-380-E, plus a `familyMember.relationship` field)* |
| **WH-384** | 🔲 | Certification of Qualifying Exigency for Military Family Leave — deployment-related (childcare arrangements, military events, counseling, etc.), no medical fields at all. | *(proposed: `servicemember.relationship`, `deployment.dates`, `exigency.category`)* |
| **WH-385** | 🔲 | Certification for Military Caregiver Leave of a **Current Servicemember** with a serious injury/illness. | *(proposed: `servicemember.relationship`, `injury.description`, `caregiving.dates`)* |
| **WH-385-V** | 🔲 | Certification for Military Caregiver Leave of a **Veteran** undergoing treatment for a service-connected injury/illness. | *(proposed: same as WH-385, veteran-specific eligibility fields)* |

**Not extraction targets:** WH-381 (Eligibility/Rights & Responsibilities Notice) and
WH-382 (Designation Notice) are *employer-issued outputs*, not documents a claimant or
provider submits — they don't fit this pipeline's "extract data from an uploaded document"
model the way the five certification forms do.

**Note on ProviderLetter:** it currently reuses WH-380-E's extraction anchors verbatim —
that's the pre-existing crude extractor's behavior (it was never type-differentiated before
the category registry existed), not a deliberate design choice for this doc type
specifically. A dedicated extractor is a natural next step, not a blocker.

**Recommendation:** add all five in order of real-world volume — WH-380-F next (closest
sibling to WH-380-E, likely highest-volume of the remaining four), then WH-384/385/385-V
as military-leave volume justifies it.

---

## 2. ADA (reasonable accommodation)

**Regulatory basis:** Equal Employment Opportunity Commission (EEOC) guidance, not a form
requirement — the ADA does not require a written request at all, let alone a standard one.

**Status:** ✅ implemented (`categories/ada.py`) as a single generic doc type.

| Doc type | Status | Purpose | Required fields (this system) |
|---|---|---|---|
| **AccommodationRequest** | ✅ | Generic accommodation-request document — models EEOC's *content* guidance (requester info, accommodation requested, reason, medical documentation only where the disability/need isn't obvious), not any specific form. | `limitation.description`, `accommodation.requested`, `provider.name` |

**There is no numbered form to expand into.** Employers self-design accommodation-request
forms (SHRM and JAN both publish widely-used unofficial templates), so "eligible documents"
for this category isn't a list to grow — it's a content pattern to keep matching. The
existing generic doc type is the architecturally correct answer here, not a placeholder
waiting to be replaced by several specific forms the way FMLA's `ProviderLetter` is.

**If this category needs to grow**, the axis isn't "more form types" — it's capturing more
of EEOC's actual content checklist (e.g. explicit `disability.notObvious` /
`documentation.reasonablyNecessary` framing) within the one doc type.

---

## 3. Workers' Compensation

**Regulatory basis:** state-regulated, not federal (with a narrow federal exception for
longshore/harbor workers, form LS-202). Every state runs its own "First Report of Injury,"
under its own form number — **50+ distinct form identities** exist. Most report into a
shared underlying data model: **IAIABC EDI Claims Release 3.1**, the industry-standard
First/Subsequent Report of Injury structure most state agencies require carriers to file
against electronically.

**Status:** ✅ implemented (`categories/workers_comp.py`) as one doc type modeling the
common core, not any one state's form.

| Doc type | Status | Purpose | Required fields (this system) |
|---|---|---|---|
| **FirstReportOfInjury** | ✅ | Generic first-report-of-injury intake, modeling the common data core shared across state forms (Mass. Form 101, NY C-2F, Wisconsin WKC-12-E, SC Form 12A, Virginia's own, etc.) and the IAIABC FROI data model. | `employer.name`, `injury.date`, `injury.description`, `injury.bodyPart` (plus `treatment.facility`, captured but not required — demonstrates a doc type doesn't need every field to be mandatory) |

**Do not attempt to enumerate all 50+ state forms individually** — the form numbers vary,
the underlying fields converge. If a specific state's exact form layout ever needs modeling
(e.g. because its field order/terminology diverges meaningfully from the common core), add
it as a second doc type in this category rather than replacing the generic one — the same
pattern ADA and FMLA's ProviderLetter already establish (a generic fallback coexisting with
specific forms, not competing with them).

**If this needs to go deeper:** the IAIABC FROI event/data table (Claims Release 3.1) is
the authoritative field reference to expand `injury.*`/`employer.*` against, not any single
state's PDF — see Sources.

---

## 4. Short-Term / Long-Term Disability (STD/LTD)

**Regulatory basis:** none — this is private insurance, not a government program. No
federal or state standard form exists.

**Status:** 🔲 not yet implemented as a category.

Every carrier (Anthem, Sun Life, MetLife, Unum, etc.) issues its own "Attending Physician
Statement" (APS) with its own layout — carrier-specific, not standardized, same situation
as Workers' Comp but with insurance companies instead of state agencies as the source of
variation. The content is fairly convergent across carriers: diagnosis, restrictions and
limitations, date of disability onset, prognosis/expected return-to-work date.

**Recommendation if this category is added:** one generic `AttendingPhysicianStatement`
doc type, same "model the content, not the form" approach already used for Workers' Comp
and ADA — proposed fields: `provider.name`, `diagnosis.description`,
`restrictions.description`, `disability.onsetDate`, `prognosis.expectedReturnDate`.

---

## 5. State Paid Family & Medical Leave (PFML)

**Regulatory basis:** state-run, employee-funded-or-employer-funded programs, separate
from and often stackable with FMLA. As of the research date below: **14 states + DC**
currently pay benefits — California, Colorado, Connecticut, Delaware, DC, Maine,
Massachusetts, Minnesota, New Jersey, New York, Oregon, Rhode Island, Washington — with
Maryland (2028) and Virginia (2028) enacted but not yet paying benefits.

**Status:** 🔲 not yet implemented as a category.

This is the one non-FMLA category with a genuinely small, enumerable, and *growing* list of
"eligible documents" — unlike Workers' Comp/STD/LTD's sprawl, 14 states is a tractable set
to model one-by-one if/when this category is prioritized. Each state's claim form differs
in both structure and terminology (e.g. CA's DE 2501/DE 2501F vs NY's PFL request forms vs
WA's Paid Leave application), so — unlike Workers' Comp — a single generic doc type would
likely under-fit; this is the category most likely to need multiple state-specific doc
types rather than one common-core type.

**Recommendation:** don't build this speculatively — prioritize by which states your
actual claim volume is in, and treat each state's form as its own doc type from the start
(rather than starting generic and splitting later, as suggested for Workers' Comp/STD/LTD).

---

## Summary

| Category | How many "eligible" documents, honestly | Implemented today |
|---|---|---|
| FMLA | 5, closed, federally numbered | 1 of 5 (WH-380-E) + generic ProviderLetter |
| ADA | 0 — no form requirement, content pattern only | 1 generic doc type |
| Workers' Comp | 50+ state form numbers, ~1 common data core (IAIABC) | 1 generic doc type |
| STD/LTD | 0 standard — carrier-specific, ~1 common content pattern | not started |
| State PFML | 14 states + DC, each genuinely different | not started |

---

## Sources

- [DOL — FMLA Forms](https://www.dol.gov/agencies/whd/fmla/forms)
- [DOL — WHD Forms](https://www.dol.gov/agencies/whd/forms)
- [EEOC — Enforcement Guidance on Reasonable Accommodation and Undue Hardship under the ADA](https://www.eeoc.gov/laws/guidance/enforcement-guidance-reasonable-accommodation-and-undue-hardship-under-ada)
- [EEOC — Practical Advice for Drafting and Implementing Reasonable Accommodation Procedures](https://www.eeoc.gov/laws/guidance/practical-advice-drafting-and-implementing-reasonable-accommodation-procedures-under)
- [IAIABC — EDI Claims Standards](https://www.iaiabc.org/edi-claims)
- [Bipartisan Policy Center — State Paid Family Leave Laws Across the U.S.](https://bipartisanpolicy.org/explainer/state-paid-family-leave-laws-across-the-u-s/)
- [CCK Law — Attending Physician Statements and LTD Claims](https://cck-law.com/blog/attending-physician-statements-and-long-term-disability-claims/)
- Research date: 2026-09-15. State PFML and form-revision details change — re-verify before treating specific dates/numbers as current.
