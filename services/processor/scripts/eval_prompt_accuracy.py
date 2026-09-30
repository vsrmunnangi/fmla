#!/usr/bin/env python3
"""Empirical eval of the LLM validation prompt's *structural* accuracy: across N repeated
calls per sample document (temperature 0, so variance here is itself informative), how
often does the model's raw output need correction by validate/engine.py's citation
verifier before it can be trusted?

This is NOT a labeled-data precision/recall eval — there's no ground truth for "is this
genuinely unclear," so it can't measure whether the model's judgment is right. What it
does measure, honestly: does the model stay inside the fieldIds/docIds it was actually
given, and does its output parse as valid JSON in the required shape. That's the thing
validate/engine.py's _to_exception() guards, and the thing worth having real numbers for
before claiming the prompt is "accurate."

Usage:
    cd services/processor
    .venv/bin/python scripts/eval_prompt_accuracy.py [--trials N] [--system-prompt path.py:VAR]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extract import ocr_pages, find_field, to_field
from categories import CATEGORIES_BY_DOC_TYPE
from validate.redact import redact
from validate.prompts import build_user_prompt
from validate.engine import _to_exception
import validate.llm_client as llm_client

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SEED = os.path.join(_REPO_ROOT, "seed")

SAMPLES = [
    ("WH-380-E", os.path.join(SEED, "sample-wh380e.pdf")),
    ("FirstReportOfInjury", os.path.join(SEED, "sample-first-report-of-injury.pdf")),
    ("AccommodationRequest", os.path.join(SEED, "sample-accommodation-request.pdf")),
]


def prepare(doc_type: str, pdf_path: str, doc_id: str = "DOC-EVAL"):
    doc_type_def = CATEGORIES_BY_DOC_TYPE[doc_type]
    pages = ocr_pages(pdf_path)
    ocr_text = "\n".join(w["text"] for p in pages for w in p["words"])
    fields = [to_field(spec, find_field(spec, pages), doc_id) for spec in doc_type_def.field_specs]
    found = [f for f in fields if f.status != "missing"]
    fields_by_doc = {doc_id: [{"fieldId": f.field_id, "value": f.value, "status": f.status} for f in found]}
    redacted_text_by_doc = {doc_id: redact(ocr_text)}
    user_prompt = build_user_prompt(fields_by_doc, redacted_text_by_doc)
    valid_field_ids = {f.field_id for f in fields}
    return user_prompt, valid_field_ids, redacted_text_by_doc


def run_trial(user_prompt: str, valid_field_ids: set[str], redacted_text_by_doc: dict[str, str]) -> dict:
    raw = llm_client.call_llm(user_prompt)
    raw_items = raw.get("exceptions", [])
    kept = []
    for i, item in enumerate(raw_items):
        exc = _to_exception(item, i, valid_field_ids, redacted_text_by_doc)
        if exc is not None:
            kept.append(exc)
    return {"raw_count": len(raw_items), "kept_count": len(kept), "dropped_count": len(raw_items) - len(kept)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=5, help="repeated calls per sample doc")
    args = parser.parse_args()

    print(f"provider={llm_client.LLM_PROVIDER} model={llm_client.LLM_MODEL} trials/doc={args.trials}")
    print(f"{'doc type':24} {'raw exc':>8} {'kept':>6} {'dropped':>8} {'conform %':>10}")
    print("-" * 62)

    totals = defaultdict(int)
    for doc_type, pdf_path in SAMPLES:
        user_prompt, valid_field_ids, redacted_text_by_doc = prepare(doc_type, pdf_path)
        raw_sum = kept_sum = dropped_sum = 0
        for _ in range(args.trials):
            r = run_trial(user_prompt, valid_field_ids, redacted_text_by_doc)
            raw_sum += r["raw_count"]
            kept_sum += r["kept_count"]
            dropped_sum += r["dropped_count"]
        conform_pct = 100.0 * kept_sum / raw_sum if raw_sum else 100.0
        print(f"{doc_type:24} {raw_sum:>8} {kept_sum:>6} {dropped_sum:>8} {conform_pct:>9.0f}%")
        totals["raw"] += raw_sum
        totals["kept"] += kept_sum
        totals["dropped"] += dropped_sum

    print("-" * 62)
    overall = 100.0 * totals["kept"] / totals["raw"] if totals["raw"] else 100.0
    print(f"{'TOTAL':24} {totals['raw']:>8} {totals['kept']:>6} {totals['dropped']:>8} {overall:>9.0f}%")
    print()
    print(f"conform % = exceptions whose citations checked out / all exceptions the model returned.")
    print(f"Not a correctness score — an exception that conforms can still be a bad judgment call,")
    print(f"and this eval has no labeled ground truth to check that against.")


if __name__ == "__main__":
    main()
