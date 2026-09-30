"""The category/doc-type registry — source of truth for what a document type requires
(rules/checklists.py), how it's extracted (was the single global extract.FIELD_SPECS,
now per doc type), and how its functional checks are derived
(was hardcoded in assemble/package.py). Adding a category is adding a new module here
and one line below — nothing else in the pipeline needs to change per category.
"""
from __future__ import annotations

from categories.types import Category, DocType
from categories.fmla import CATEGORY as FMLA
from categories.workers_comp import CATEGORY as WORKERS_COMP
from categories.ada import CATEGORY as ADA

CATEGORIES: list[Category] = [FMLA, WORKERS_COMP, ADA]

CATEGORIES_BY_KEY: dict[str, Category] = {c.key: c for c in CATEGORIES}

CATEGORIES_BY_DOC_TYPE: dict[str, DocType] = {}
CATEGORY_KEY_BY_DOC_TYPE: dict[str, str] = {}
for _category in CATEGORIES:
    for _doc_type in _category.doc_types:
        if _doc_type.type in CATEGORIES_BY_DOC_TYPE:
            raise ValueError(f"duplicate doc type across categories: {_doc_type.type}")
        CATEGORIES_BY_DOC_TYPE[_doc_type.type] = _doc_type
        CATEGORY_KEY_BY_DOC_TYPE[_doc_type.type] = _category.key
del _category, _doc_type
