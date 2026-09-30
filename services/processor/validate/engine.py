"""Orchestrates the LLM validation step (§7.2 step 4): redact -> prompt -> call -> verify -> GapException[].

The one rule that matters here: never trust the LLM's citations blindly. Any
exception whose evidenceRefs/sources don't point at real fields/documents we
actually gave it — or whose quote doesn't actually appear in that document's
text — is dropped, not passed through.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from fmla_contracts.exception_schema import Exception as GapException, SourceRef

from contracts import EvidenceField
from validate.llm_client import call_llm
from validate.prompts import build_user_prompt
from validate.redact import redact

logger = logging.getLogger(__name__)

VALID_EXCEPTION_TYPES = ("unclear", "conflict", "low_confidence")


def validate_fields(
    fields: list[EvidenceField],
    ocr_text_by_doc: dict[str, str],
) -> list[GapException]:
    """fields: extracted fields (status/value already set by extract + rules).
    ocr_text_by_doc: docId -> full OCR text for that document (pre-redaction).
    """
    found = [f for f in fields if f.status != "missing"]
    if not found:
        return []

    fields_by_doc: dict[str, list[dict]] = defaultdict(list)
    for f in found:
        doc_id = f.source.doc_id if f.source else "unknown"
        fields_by_doc[doc_id].append({"fieldId": f.field_id, "value": f.value, "status": f.status})

    redacted_text_by_doc = {doc_id: redact(text) for doc_id, text in ocr_text_by_doc.items()}

    user_prompt = build_user_prompt(dict(fields_by_doc), redacted_text_by_doc)
    raw = call_llm(user_prompt)

    valid_field_ids = {f.field_id for f in fields}

    exceptions: list[GapException] = []
    for i, item in enumerate(raw.get("exceptions", [])):
        exc = _to_exception(item, i, valid_field_ids, redacted_text_by_doc)
        if exc is not None:
            exceptions.append(exc)
    return exceptions


def _normalize_whitespace(text: str) -> str:
    """Our OCR text is word-tokenized and newline-joined (extract.py), so a literal
    multi-word quote like "as needed" appears as "as\\nneeded" — collapse all whitespace
    runs to a single space on both sides before substring-checking a quote."""
    return " ".join(text.split())


def _quote_appears_in_doc(quote: str, doc_text: str) -> bool:
    quote = _normalize_whitespace(quote).lower()
    if not quote:
        return False
    return quote in _normalize_whitespace(doc_text).lower()


def _to_exception(
    item: dict, index: int, valid_field_ids: set[str], redacted_text_by_doc: dict[str, str]
) -> GapException | None:
    try:
        exc_type = item["type"]
        if exc_type not in VALID_EXCEPTION_TYPES:
            raise ValueError(f"unexpected exception type from LLM: {exc_type}")

        # A local 7B model doesn't always keep evidenceRefs/sources perfectly clean (e.g. it
        # sometimes slips a docId into evidenceRefs) — filter out anything unverifiable rather
        # than rejecting the whole exception, but never accept a citation we can't verify.
        evidence_refs = [r for r in item["evidenceRefs"] if r in valid_field_ids]
        sources = [
            s for s in item["sources"]
            if s.get("docId") in redacted_text_by_doc
            and isinstance(s.get("page"), int)
            and _quote_appears_in_doc(s.get("quote", ""), redacted_text_by_doc[s["docId"]])
        ]

        if not evidence_refs:
            raise ValueError(f"no verifiable evidenceRefs left after filtering: {item['evidenceRefs']}")
        if not sources:
            raise ValueError(f"no verifiable sources left after filtering (quote didn't check out): {item['sources']}")

        return GapException(
            exceptionId=f"EXC-{exc_type}-{index}",
            type=exc_type,
            title=item["title"],
            detail=item["detail"],
            evidenceRefs=evidence_refs,
            sources=[SourceRef(docId=s["docId"], page=s["page"]) for s in sources],
            cure=None,
        )
    except (KeyError, ValueError, TypeError) as e:
        logger.warning("dropping unverifiable LLM exception at index %d: %s", index, e)
        return None
