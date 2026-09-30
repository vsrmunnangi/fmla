"""FastAPI entrypoint (§7.1, §7.2 step 5): POST /process.

Stateless: OCR -> extract -> rules (missing) -> LLM validate (unclear/conflict)
-> assemble -> return the EvidencePackage. `api` persists it; this service
never talks to a database.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from extract import find_field, ocr_pages, resolve_document, to_field
from categories import CATEGORIES_BY_DOC_TYPE
from rules.engine import check_missing
from validate.engine import validate_fields
from assemble.package import build_package

app = FastAPI(title="FMLA Evidence Processor")


class DocumentIn(BaseModel):
    docId: str
    type: str
    storageKey: str


class ProcessRequest(BaseModel):
    claimId: str
    documents: list[DocumentIn]
    # Not in the literal §7.1 request shape: api owns claimant/employer/leave-year data (the
    # `claims` row) and the next package version number. Passing them through here is how the
    # stateless processor can still fill §4.3's required `claim` block and `packageVersion`
    # without needing its own database. Both are optional so the endpoint is testable standalone.
    claim: dict | None = None
    packageVersion: int = 1


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/process")
def process(req: ProcessRequest) -> dict:
    started_at = datetime.now(timezone.utc)

    all_fields = []
    documents_meta = []
    ocr_text_by_doc: dict[str, str] = {}
    missing_exceptions = []

    for doc in req.documents:
        doc_type_def = CATEGORIES_BY_DOC_TYPE.get(doc.type)
        if doc_type_def is None:
            raise HTTPException(400, f"unknown document type: {doc.type!r}")

        path = resolve_document(doc.storageKey)
        pages = ocr_pages(path)
        ocr_text_by_doc[doc.docId] = "\n".join(w["text"] for p in pages for w in p["words"])

        doc_fields = [to_field(spec, find_field(spec, pages), doc.docId) for spec in doc_type_def.field_specs]
        all_fields.extend(doc_fields)
        missing_exceptions.extend(check_missing(doc_fields, doc.type, doc.docId))

        documents_meta.append({
            "docId": doc.docId,
            "type": doc.type,
            "pages": len(pages),
            "receivedAt": started_at.date().isoformat(),
            "status": "received",
        })

    llm_exceptions = validate_fields(all_fields, ocr_text_by_doc)
    exceptions = missing_exceptions + llm_exceptions

    completed_at = datetime.now(timezone.utc)
    run_id = f"RUN-{_idempotency_hash(req.claimId, req.documents, ocr_text_by_doc)}"

    return build_package(
        claim_id=req.claimId,
        run_id=run_id,
        version=req.packageVersion,
        documents=documents_meta,
        fields=all_fields,
        exceptions=exceptions,
        claim_summary=req.claim,
        started_at=started_at,
        completed_at=completed_at,
    )


def _idempotency_hash(claim_id: str, documents: list[DocumentIn], ocr_text_by_doc: dict[str, str]) -> str:
    """(claimId, sorted docIds + content hash) -> a stable id, folded into runId.

    A repeat call with the same claim, same document set, and the same OCR'd content produces the
    same runId — that's the signal `api` (or a caller) uses to recognize "this is a re-run of the
    same inputs," per §7.1's idempotency requirement. Processor itself does no caching/dedup —
    it's stateless; this just makes the key visible to whoever does.
    """
    doc_ids_sorted = sorted(d.docId for d in documents)
    content = "".join(ocr_text_by_doc.get(d, "") for d in doc_ids_sorted)
    digest = hashlib.sha256(f"{claim_id}:{','.join(doc_ids_sorted)}:{content}".encode()).hexdigest()
    return digest[:16]
