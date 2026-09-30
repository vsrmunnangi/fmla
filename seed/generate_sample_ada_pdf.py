#!/usr/bin/env python3
"""Generates seed/sample-accommodation-request.pdf — a synthetic ADA accommodation-request
document for testing the "AccommodationRequest" doc type end to end. Same pattern as
generate_sample_pdf.py (WH-380-E); anchors here match
services/processor/categories/ada.py's FIELD_SPECS exactly.

Dev-only tool (not a runtime dependency); requires `pip install reportlab`.
Deliberately synthetic/fake data only (§3, invariant #7 — no real PHI).
"""
import os

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT_PATH = os.path.join(os.path.dirname(__file__), "sample-accommodation-request.pdf")

LINES = [
    ("ACCOMMODATION REQUEST FORM", 16, True),
    ("", 12, False),
    ("Job title: Warehouse Associate", 12, False),
    ("", 12, False),
    ("Description of limitation: Difficulty standing for long periods", 12, False),
    ("", 12, False),
    ("Accommodation requested: Sit stand desk and frequent breaks", 12, False),
    ("", 12, False),
    ("Name of health care provider: Dr. Maria Chen", 12, False),
]


def main():
    c = canvas.Canvas(OUT_PATH, pagesize=letter)
    width, height = letter
    y = height - 100
    for text, size, bold in LINES:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        if text:
            c.drawString(72, y, text)
        y -= size + 12
    c.showPage()
    c.save()
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
