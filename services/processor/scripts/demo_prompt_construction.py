#!/usr/bin/env python3
"""Live demo: exactly how the LLM validation prompt gets built and checked, step by step.

Not a new code path — every step below calls the real functions from validate/*.py and
categories/*.py. This just narrates what validate_fields() normally does in one call, so
each stage is visible: raw OCR -> PHI redaction -> system prompt -> assembled user prompt
-> the real Ollama call -> the LLM's raw response -> citation verification -> what
actually reaches the examiner.

Usage:
    cd services/processor
    .venv/bin/python scripts/demo_prompt_construction.py [pdf] [doc-type] [doc-id]

Defaults to the WH-380-E sample. Try the Workers' Comp or ADA samples too:
    .venv/bin/python scripts/demo_prompt_construction.py \\
        ../../seed/sample-first-report-of-injury.pdf FirstReportOfInjury DOC-DEMO
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

# Run from services/processor (like every other script/test here) — this just makes
# `scripts/demo_prompt_construction.py` importable as a direct file invocation too.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract import ocr_pages, find_field, to_field
from categories import CATEGORIES_BY_DOC_TYPE
from validate.redact import redact
from validate.prompts import SYSTEM_PROMPT, RESPONSE_SCHEMA, build_user_prompt
from validate.llm_client import call_llm, LLM_MODEL, LLM_PROVIDER
from validate.engine import _to_exception


def banner(title: str) -> None:
    print()
    print("=" * 78)
    print(f"  {title}")
    print("=" * 78)


def main() -> None:
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "../../seed/sample-wh380e.pdf"
    doc_type = sys.argv[2] if len(sys.argv) > 2 else "WH-380-E"
    doc_id = sys.argv[3] if len(sys.argv) > 3 else "DOC-DEMO"

    doc_type_def = CATEGORIES_BY_DOC_TYPE.get(doc_type)
    if doc_type_def is None:
        print(f"unknown doc type {doc_type!r} — known types: {sorted(CATEGORIES_BY_DOC_TYPE)}")
        sys.exit(1)

    # --- Stage 1: OCR + extraction (the same code the real pipeline runs) ---
    banner("STAGE 1 — OCR + extraction (extract.py, categories/*.py)")
    pages = ocr_pages(pdf_path)
    ocr_text = "\n".join(w["text"] for p in pages for w in p["words"])
    print(f"[{doc_type}] {pdf_path} -> {len(pages)} page(s), {len(ocr_text.split())} words")

    fields = [to_field(spec, find_field(spec, pages), doc_id) for spec in doc_type_def.field_specs]
    found_fields = [f for f in fields if f.status != "missing"]
    print(f"extracted {len(found_fields)}/{len(fields)} fields (rest are 'missing' — the rules engine's job, not the LLM's):")
    for f in found_fields:
        print(f"  {f.field_id:32} = {f.value!r}  (confidence {f.confidence})")

    # --- Stage 2: raw OCR text, before anything is sent anywhere ---
    banner("STAGE 2 — raw OCR text (what the document actually says)")
    print(ocr_text)

    # --- Stage 3: PHI redaction (Presidio) — this runs BEFORE any LLM ever sees the text ---
    banner("STAGE 3 — PHI redaction (validate/redact.py, Presidio) — runs before stage 4")
    redacted_text = redact(ocr_text)
    print(redacted_text)
    if redacted_text == ocr_text:
        print("\n(no PHI entities detected in this synthetic sample — real provider/claimant\n"
              " names, dates, and phone numbers get replaced with <PERSON>/<DATE_TIME>/etc. here)")

    # --- Stage 4: the system prompt — the actual governance text sent to the model ---
    banner("STAGE 4 — system prompt (validate/prompts.py:SYSTEM_PROMPT, sent verbatim)")
    print(SYSTEM_PROMPT)

    # --- Stage 5: the assembled user prompt — redacted text + extracted fields, nothing else ---
    banner("STAGE 5 — user prompt (validate/prompts.py:build_user_prompt, real assembled output)")
    fields_by_doc: dict[str, list[dict]] = defaultdict(list)
    for f in found_fields:
        fields_by_doc[doc_id].append({"fieldId": f.field_id, "value": f.value, "status": f.status})
    redacted_text_by_doc = {doc_id: redacted_text}
    user_prompt = build_user_prompt(dict(fields_by_doc), redacted_text_by_doc)
    print(user_prompt)

    # --- Stage 6: the structured-output contract the model must fill in ---
    banner("STAGE 6 — response schema (validate/prompts.py:RESPONSE_SCHEMA)")
    print(json.dumps(RESPONSE_SCHEMA, indent=2))

    # --- Stage 7: the real call ---
    banner(f"STAGE 7 — real call to {LLM_PROVIDER}/{LLM_MODEL} (validate/llm_client.py:call_llm)")
    print("calling...")
    raw = call_llm(user_prompt)
    print(json.dumps(raw, indent=2))

    # --- Stage 8: citation verification — never trust the model's citations blindly ---
    banner("STAGE 8 — citation verification (validate/engine.py) — what actually reaches the examiner")
    valid_field_ids = {f.field_id for f in fields}
    kept, dropped = [], []
    for i, item in enumerate(raw.get("exceptions", [])):
        exc = _to_exception(item, i, valid_field_ids, redacted_text_by_doc)
        (kept if exc is not None else dropped).append(item)

    print(f"{len(kept)} exception(s) kept, {len(dropped)} dropped as unverifiable")
    for item in kept:
        print(f"  KEPT    [{item['type']}] {item['title']}  <- {item['evidenceRefs']}")
    for item in dropped:
        print(f"  DROPPED [{item.get('type')}] {item.get('title')}  <- {item.get('evidenceRefs')} (citation didn't check out)")


if __name__ == "__main__":
    main()
