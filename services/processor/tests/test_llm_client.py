"""Unit coverage for validate/llm_client.py's own HTTP/parsing logic — separate from
test_validate.py, which mocks call_llm out entirely to test engine.py's citation-checking.

The Bedrock path here is mocked (boto3 client) because this AWS account currently has
Bedrock blocked at the org-policy level — see llm_client.py's module docstring. Live
verification against real Bedrock is still pending; this only proves the request/response
handling is correct against the documented Converse API shape.
"""
import json

import httpx

import validate.llm_client as llm_client


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_call_ollama_success(monkeypatch):
    body = {"exceptions": [{"type": "unclear", "title": "t", "detail": "d", "evidenceRefs": ["f"], "sources": [{"docId": "DOC-1", "page": 1}]}]}
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeResponse({"message": {"content": json.dumps(body)}}))
    result = llm_client._call_ollama("prompt")
    assert result == body


def test_call_ollama_http_error_degrades_to_empty(monkeypatch):
    def raise_error(*a, **k):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(httpx, "post", raise_error)
    assert llm_client._call_ollama("prompt") == {"exceptions": []}


def test_call_ollama_malformed_json_degrades_to_empty(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeResponse({"message": {"content": "not json"}}))
    assert llm_client._call_ollama("prompt") == {"exceptions": []}


def test_call_ollama_non_exceptions_shape_degrades_to_empty(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeResponse({"message": {"content": json.dumps({"foo": "bar"})}}))
    assert llm_client._call_ollama("prompt") == {"exceptions": []}


class _FakeBedrockClient:
    def __init__(self, response=None, raise_exc=None):
        self._response = response
        self._raise_exc = raise_exc
        self.last_call = None

    def converse(self, **kwargs):
        self.last_call = kwargs
        if self._raise_exc:
            raise self._raise_exc
        return self._response


def _bedrock_response(text: str) -> dict:
    return {"output": {"message": {"content": [{"text": text}]}}}


def test_call_bedrock_success(monkeypatch):
    body = {"exceptions": [{"type": "conflict", "title": "t", "detail": "d", "evidenceRefs": ["f"], "sources": [{"docId": "DOC-1", "page": 1}]}]}
    fake_client = _FakeBedrockClient(_bedrock_response(json.dumps(body)))
    monkeypatch.setattr("boto3.client", lambda service, region_name=None: fake_client)

    result = llm_client._call_bedrock("prompt")

    assert result == body
    assert fake_client.last_call["modelId"] == llm_client.BEDROCK_MODEL_ID
    assert fake_client.last_call["messages"][0]["content"][0]["text"] == "prompt"


def test_call_bedrock_strips_markdown_fence(monkeypatch):
    body = {"exceptions": []}
    fenced = f"```json\n{json.dumps(body)}\n```"
    fake_client = _FakeBedrockClient(_bedrock_response(fenced))
    monkeypatch.setattr("boto3.client", lambda service, region_name=None: fake_client)

    assert llm_client._call_bedrock("prompt") == body


def test_call_bedrock_client_error_degrades_to_empty(monkeypatch):
    fake_client = _FakeBedrockClient(raise_exc=RuntimeError("Access to Bedrock models is not allowed for this account"))
    monkeypatch.setattr("boto3.client", lambda service, region_name=None: fake_client)

    assert llm_client._call_bedrock("prompt") == {"exceptions": []}


def test_call_bedrock_malformed_json_degrades_to_empty(monkeypatch):
    fake_client = _FakeBedrockClient(_bedrock_response("not json"))
    monkeypatch.setattr("boto3.client", lambda service, region_name=None: fake_client)

    assert llm_client._call_bedrock("prompt") == {"exceptions": []}


def test_call_llm_dispatches_to_bedrock_when_selected(monkeypatch):
    calls = {"ollama": 0, "bedrock": 0}
    monkeypatch.setattr(llm_client, "_call_ollama", lambda prompt: calls.__setitem__("ollama", calls["ollama"] + 1) or {"exceptions": []})
    monkeypatch.setattr(llm_client, "_call_bedrock", lambda prompt: calls.__setitem__("bedrock", calls["bedrock"] + 1) or {"exceptions": []})

    llm_client.call_llm("prompt", provider="bedrock")
    assert calls == {"ollama": 0, "bedrock": 1}

    llm_client.call_llm("prompt", provider="ollama")
    assert calls == {"ollama": 1, "bedrock": 1}
