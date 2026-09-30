"""Validates an EvidencePackage dict against packages/contracts/schema/*.json (the CI-drift source
of truth), resolving the cross-file $refs between the three schemas."""
from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "schema"
SCHEMA_FILES = ["evidence-field.schema.json", "exception.schema.json", "evidence-package.schema.json"]


def load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text())


def validator_for(schema_name: str) -> Draft202012Validator:
    """A validator for any one of the three schemas, with the cross-file $refs between them resolved."""
    resources = [Resource.from_contents(load_schema(f)) for f in SCHEMA_FILES]
    registry = Registry().with_resources([(r.id(), r) for r in resources])
    return Draft202012Validator(load_schema(schema_name), registry=registry)


def assert_valid_package(instance: dict) -> None:
    errors = sorted(validator_for("evidence-package.schema.json").iter_errors(instance), key=lambda e: e.path)
    if errors:
        messages = "\n".join(f"  - {'/'.join(map(str, e.path))}: {e.message}" for e in errors)
        raise AssertionError(f"EvidencePackage failed schema validation:\n{messages}")
