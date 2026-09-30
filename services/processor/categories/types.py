"""Shapes for the category/doc-type registry. Split into its own module (rather than
living in __init__.py) so category modules (fmla.py, workers_comp.py, ...) can import
these without any import-order fragility against the package's own __init__.py."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from contracts import EvidenceField

FunctionalCheckFn = Callable[[list[EvidenceField]], list[dict]]


@dataclass(frozen=True)
class DocType:
    """Everything the pipeline needs to know about one document type, in one place —
    replaces the three previously-scattered per-type things: rules/checklists.py's
    REQUIRED entry, extract.py's (formerly global, not type-aware) FIELD_SPECS, and
    assemble/package.py's hardcoded functional-check derivation."""

    type: str  # matches documents.type / EvidencePackage document type, e.g. "WH-380-E"
    label: str  # human-readable, shown in the web upload dropdown
    required_fields: list[str]
    field_specs: list[dict]
    functional_check_fn: FunctionalCheckFn | None = None


@dataclass(frozen=True)
class Category:
    key: str  # matches claims.type, e.g. "FMLA"
    label: str
    doc_types: list[DocType] = field(default_factory=list)
