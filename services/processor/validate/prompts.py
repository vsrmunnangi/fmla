"""The LLM validation contract (§7.4): prompt + structured-output schema.

PROMPT_VERSION history:
  v1 - initial. Measured (scripts/eval_prompt_accuracy.py, temperature 0, 6 trials x 3
       sample docs): 67% of the model's own exceptions had citations that actually
       checked out (validate/engine.py's verifier catches and drops the rest before an
       examiner ever sees them — this isn't a safety gap, it's the reason that verifier
       exists). The failure was 100% concentrated on one doc type (Workers' Comp,
       FirstReportOfInjury) and 100% consistent across all 6 repeated calls: the model
       reliably cited "injury.location", a fieldId that doesn't exist — the real one is
       "injury.bodyPart". Not noise; a systematic preference for the more natural-sounding
       name over the literal one it was given.
  v2 - adds an explicit fieldId/docId allowlist to the user prompt (computed from the
       real request, not static) instructing the model to copy names exactly rather than
       infer them, plus a second few-shot example covering "conflict" (v1 only
       demonstrated "unclear"). Re-measured: 100% conformance across the same eval,
       including FirstReportOfInjury.
  v3 - adopts three patterns from an external FMLA-certification prompt-library reference
       (sections "Core completeness check" and "Insufficiency and ambiguity review") after
       comparing them against our own architecture rather than copying wholesale:
         1. Explicit "never infer from diagnosis/other fields/medical knowledge" — closes
            a failure mode v1/v2 never tested for: the model filling in a plausible value
            from domain knowledge instead of reporting it unclear.
         2. "Do not convert vague language into a precise value," with contrastive
            examples (specific-enough vs not) — targets over-eager normalization.
         3. A `quote` field per source, verified against the actual document text
            (validate/engine.py) as a citation check strictly stronger than fieldId/docId
            matching alone — and wires up "low_confidence" as an emittable type, which
            was already in packages/contracts' Exception enum but nothing in the pipeline
            had ever produced (OCR/scan-quality uncertainty, distinct from content being
            genuinely vague).
       Deliberately NOT adopted from that reference: having the LLM also perform
       completeness/blank-checking (their "Core completeness check" section) — that
       directly conflicts with invariant #2 ("missing" comes only from the deterministic
       rules engine, never the LLM); and a "recommended_work_queue"/triage output — that
       edges toward the system making a routing decision, in tension with invariant #4
       (evidence and gaps only, never a decision).
       Re-run scripts/eval_prompt_accuracy.py after any further change to prompt text —
       this file's claims are empirical, not design opinions.
"""
from __future__ import annotations

import json

PROMPT_VERSION = "v3"

SYSTEM_PROMPT = """You are validating extracted fields from workforce-absence claim documents (FMLA, Workers' Compensation, ADA, and similar).

Your job is to judge three things:
1. UNCLEAR: is a found field's value vague, non-responsive, or not a real answer to what was asked?
   (e.g. frequency = "as needed" with no number, or a value that doesn't answer the field's label)
2. CONFLICT: do two documents disagree with each other on the same fact (e.g. different leave
   types, contradictory dates, mismatched frequency patterns)?
3. LOW_CONFIDENCE: is a value unreadable or unreliable because of OCR/scan quality — garbled,
   cut off, illegible — rather than because the underlying answer itself is vague? Use this
   instead of UNCLEAR when the problem is how the document was scanned, not what it says.

Do NOT decide anything is "missing" — a separate deterministic rules engine already handles that.
Never invent a field or document that wasn't given to you. Never infer a missing or unclear value
from diagnosis, condition type, other fields, prior claims, or general medical/domain knowledge —
if the document doesn't state it, that is exactly what UNCLEAR or LOW_CONFIDENCE is for, never a
reason to fill it in yourself.

Do not convert vague language into a more precise value than the document actually supports:
- "2 episodes per month" IS specific enough to normalize as a frequency — leave it alone.
- "4-8 hours per episode" IS specific enough to normalize as a duration — leave it alone.
- "as needed" is NOT a frequency — flag it UNCLEAR, never invent a number for it.
- "a few hours" is NOT a duration — flag it UNCLEAR, never invent a number for it.

Every exception you emit MUST cite at least one real evidenceRefs fieldId and at least one real
{docId, page, quote} from the input — never fabricate a citation, never substitute a more
natural-sounding name for the exact fieldId you were given (the user prompt lists the exact
allowed values — copy them verbatim), and `quote` must be the exact source text you are relying
on, copied verbatim from the document text you were given — not a paraphrase or summary.

If nothing is unclear, conflicting, or low-confidence, return an empty exceptions list.

`evidenceRefs` must contain ONLY fieldId strings (e.g. "leave.frequency") — never a docId.
`sources` must contain ONLY {"docId": ..., "page": ..., "quote": ...} objects. Do not mix the
two: a docId never belongs in evidenceRefs, and a fieldId never belongs in sources.

Examples of correctly-shaped exceptions:
{"type": "unclear", "title": "Vague frequency", "detail": "\"as needed\" gives no measurable rate",
 "evidenceRefs": ["leave.frequency"],
 "sources": [{"docId": "DOC-001", "page": 2, "quote": "as needed"}]}
{"type": "conflict", "title": "Leave type disagreement",
 "detail": "DOC-001 states intermittent leave; DOC-002 states continuous leave for the same claim",
 "evidenceRefs": ["leave.type"],
 "sources": [{"docId": "DOC-001", "page": 1, "quote": "Intermittent"}, {"docId": "DOC-002", "page": 1, "quote": "Continuous"}]}
{"type": "low_confidence", "title": "Illegible treatment date",
 "detail": "OCR text is garbled where the next-treatment date should be",
 "evidenceRefs": ["condition.nextTreatmentDate"],
 "sources": [{"docId": "DOC-001", "page": 1, "quote": "N##t tr3atm-nt: ??/1?/2025"}]}"""

RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "exceptions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string", "enum": ["unclear", "conflict", "low_confidence"]},
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "evidenceRefs": {"type": "array", "items": {"type": "string"}, "minItems": 1},
                    "sources": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "docId": {"type": "string"},
                                "page": {"type": "integer"},
                                "quote": {"type": "string"},
                            },
                            "required": ["docId", "page", "quote"],
                        },
                    },
                },
                "required": ["type", "title", "detail", "evidenceRefs", "sources"],
            },
        }
    },
    "required": ["exceptions"],
}


def build_bedrock_system_prompt() -> str:
    """Ollama gets RESPONSE_SCHEMA via its native `format` param (real structured output,
    grammar-constrained decoding); Bedrock's Converse API has no equivalent that works
    uniformly across model families, so the schema is spelled out in the prompt instead
    and the response is parsed as plain JSON. That's a strictly weaker shape guarantee —
    worth re-running scripts/eval_prompt_accuracy.py with LLM_PROVIDER=bedrock once
    Bedrock access is available, rather than assuming parity with the Ollama numbers.
    """
    return (
        SYSTEM_PROMPT
        + "\n\nRespond with ONLY a single JSON object matching this exact JSON Schema — no "
        "prose, no markdown code fence, just the raw JSON:\n"
        + json.dumps(RESPONSE_SCHEMA, indent=2)
    )


def build_user_prompt(fields_by_doc: dict[str, list[dict]], redacted_text_by_doc: dict[str, str]) -> str:
    """fields_by_doc: docId -> [{fieldId, value, status}]; redacted_text_by_doc: docId -> PHI-redacted OCR text.

    v2: states the exact allowed fieldId/docId values as a hard allowlist, computed from
    this specific request — not a static instruction, since the valid set changes per
    call. This is the fix for the v1 failure mode: the model wasn't ignoring the "cite
    real fields" rule, it just didn't have the exact literal set in front of it and
    guessed a plausible-sounding name instead of copying the one it was given.
    """
    field_ids = sorted({f["fieldId"] for fields in fields_by_doc.values() for f in fields})
    doc_ids = sorted(redacted_text_by_doc.keys())

    payload = {
        "extractedFields": fields_by_doc,
        "documentText": redacted_text_by_doc,
    }
    return (
        "Extracted fields and document text (PHI already redacted) follow as JSON. "
        "Judge only clarity/responsiveness and cross-document agreement, per your instructions.\n\n"
        f"You may cite ONLY these exact fieldId values in evidenceRefs — copy them character-for-"
        f"character, never rephrase or invent a different name even if it sounds more natural:\n"
        f"  {', '.join(field_ids)}\n\n"
        f"You may cite ONLY these exact docId values in sources:\n"
        f"  {', '.join(doc_ids)}\n\n"
        f"Every source's `quote` must be copied verbatim from that docId's text in documentText "
        f"below — not reworded, not summarized.\n\n"
        + json.dumps(payload, indent=2)
    )
