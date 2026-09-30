"""
contracts.py — the shared data shapes for extracted evidence.

The atomic unit is EvidenceField: a value, how confident we are, and WHERE it
came from (document -> page -> region). The enforced invariant is that a
non-null, provider-derived value MUST carry a source pointer — that is the
traceability spine the whole system depends on.

Output uses camelCase aliases (fieldId, docId) so the JSON matches the
read-model the React UI renders. Later this file is replaced by types
generated from packages/contracts JSON Schema; the shape stays the same.
"""
from __future__ import annotations

from typing import Optional, Literal, List
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EvidenceStatus = Literal["ok", "unclear", "low_confidence", "missing"]


class Source(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    doc_id: str = Field(alias="docId")
    page: int                                  # 1-based page number
    bbox: Optional[List[float]] = None         # [x, y, w, h], normalized 0..1

    @field_validator("bbox")
    @classmethod
    def _bbox_shape(cls, v: Optional[List[float]]):
        if v is not None and len(v) != 4:
            raise ValueError("bbox must be [x, y, w, h]")
        return v


class EvidenceField(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    field_id: str = Field(alias="fieldId")
    group: str
    label: str
    value: Optional[str] = None
    confidence: float = 0.0
    status: EvidenceStatus = "ok"
    source: Optional[Source] = None

    @model_validator(mode="after")
    def _source_required(self):
        # A present, provider-derived value must be traceable to its source.
        if self.value is not None and self.status != "missing" and self.source is None:
            raise ValueError(
                f"{self.field_id}: value is present but has no source — "
                "the contract requires a document -> page -> region pointer"
            )
        return self


if __name__ == "__main__":
    # tiny self-test: valid field passes, source-less value fails
    ok = EvidenceField(
        field_id="provider.name", group="provider", label="Provider name",
        value="Sarah Johnson, MD", confidence=0.98, status="ok",
        source=Source(doc_id="DOC-001", page=1, bbox=[0.12, 0.20, 0.30, 0.04]),
    )
    print("valid field OK:", ok.model_dump(by_alias=True))

    try:
        EvidenceField(field_id="x", group="g", label="l", value="present", confidence=0.9, status="ok")
    except Exception as e:
        print("source-required rule works:", type(e).__name__)
