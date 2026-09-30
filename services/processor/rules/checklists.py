"""Per-document-type required-field checklists (§7.3 of the spec).

Source of truth moved to services/processor/categories/ (the category/doc-type
registry), which also owns extraction specs and functional-check derivation per type —
this module is now a thin flat view over it, kept so rules/engine.py's check_missing()
(keyed by doc-type string only) doesn't need to change at all.
"""
from __future__ import annotations

from categories import CATEGORIES_BY_DOC_TYPE

REQUIRED: dict[str, list[str]] = {
    doc_type: dt.required_fields for doc_type, dt in CATEGORIES_BY_DOC_TYPE.items()
}
