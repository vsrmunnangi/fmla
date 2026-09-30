import os

import boto3
import pytest
from moto import mock_aws

from extract import resolve_document


@mock_aws
def test_resolve_document_downloads_from_s3(tmp_path, monkeypatch):
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.delenv("S3_ENDPOINT", raising=False)

    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="fmla-test-bucket")
    s3.put_object(Bucket="fmla-test-bucket", Key="claims/FMLA-1/DOC-001.pdf", Body=b"%PDF-1.4 fake content")

    path = resolve_document("s3://fmla-test-bucket/claims/FMLA-1/DOC-001.pdf")
    try:
        assert os.path.exists(path)
        with open(path, "rb") as f:
            assert f.read() == b"%PDF-1.4 fake content"
    finally:
        os.remove(path)


def test_resolve_document_local_path_unchanged(tmp_path):
    p = tmp_path / "doc.pdf"
    p.write_bytes(b"local content")
    assert resolve_document(str(p)) == str(p)


def test_resolve_document_missing_local_path_raises():
    with pytest.raises(FileNotFoundError):
        resolve_document("/no/such/file.pdf")
