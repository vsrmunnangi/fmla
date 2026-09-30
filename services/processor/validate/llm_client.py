"""LLM client for the validate step — Ollama (local, default) or AWS Bedrock (hosted).

LLM_PROVIDER selects the backend ("ollama" | "bedrock"); everything else is env-var
config for whichever one is active (invariant #6 — hosted deps behind an env var, not a
code change). Local Ollama is the default so nothing changes for existing setups.

NOTE on the Bedrock path: written against boto3's bedrock-runtime Converse API and the
Mistral-on-Bedrock model family, but **not exercised against real Bedrock** — this AWS
account currently has Bedrock blocked at the org-policy level ("Access to Bedrock models
is not allowed for this account"), confirmed via a live `converse` call that returned
that exact error. Covered here by tests that mock the boto3 client; verify for real once
Bedrock access is granted.
"""
from __future__ import annotations

import json
import os

import httpx

from validate.prompts import RESPONSE_SCHEMA, SYSTEM_PROMPT, build_bedrock_system_prompt

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "ollama")  # "ollama" | "bedrock"

# --- Ollama (local, default) ---
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434")
LLM_MODEL = os.environ.get("LLM_MODEL", "mistral")
TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "60"))

# --- Bedrock (hosted, opt-in) ---
BEDROCK_REGION = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "mistral.mistral-large-2402-v1:0")


def call_llm(user_prompt: str, *, provider: str = LLM_PROVIDER) -> dict:
    """Returns the parsed {"exceptions": [...]} dict, or {"exceptions": []} on any failure.

    A validation-quality LLM step failing should degrade to "no extra findings," never crash the
    pipeline or block the deterministic rules-engine output — true for either provider.
    """
    if provider == "bedrock":
        return _call_bedrock(user_prompt)
    return _call_ollama(user_prompt)


def _call_ollama(user_prompt: str, *, base_url: str = LLM_BASE_URL, model: str = LLM_MODEL) -> dict:
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": RESPONSE_SCHEMA,  # Ollama-native structured output
        "options": {"temperature": 0.0},
    }
    try:
        resp = httpx.post(f"{base_url}/api/chat", json=body, timeout=TIMEOUT_S)
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        parsed = json.loads(content)
    except (httpx.HTTPError, KeyError, json.JSONDecodeError):
        return {"exceptions": []}
    return _coerce(parsed)


def _call_bedrock(user_prompt: str, *, model_id: str = BEDROCK_MODEL_ID, region: str = BEDROCK_REGION) -> dict:
    import boto3  # local import: keeps boto3 optional for anyone only ever using Ollama

    client = boto3.client("bedrock-runtime", region_name=region)
    try:
        resp = client.converse(
            modelId=model_id,
            system=[{"text": build_bedrock_system_prompt()}],
            messages=[{"role": "user", "content": [{"text": user_prompt}]}],
            inferenceConfig={"temperature": 0.0},
        )
        content = resp["output"]["message"]["content"][0]["text"]
        parsed = json.loads(_strip_markdown_fence(content))
    except Exception:  # noqa: BLE001 — boto3 raises botocore.exceptions.ClientError and friends;
        # catching broadly here matches the Ollama path's "degrade, never crash" contract.
        return {"exceptions": []}
    return _coerce(parsed)


def _strip_markdown_fence(text: str) -> str:
    """Bedrock models sometimes wrap JSON in ```json ... ``` even when told not to."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -len("```")]
        if text.startswith("json"):
            text = text[len("json"):]
    return text.strip()


def _coerce(parsed: object) -> dict:
    if not isinstance(parsed, dict) or not isinstance(parsed.get("exceptions"), list):
        return {"exceptions": []}
    return parsed
