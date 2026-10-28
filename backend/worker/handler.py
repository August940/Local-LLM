"""RunPod serverless handler: runs one ComfyUI workflow per job and returns the output files.

Job input:
    {"workflow": {...ComfyUI API prompt...},
     "input_image_url": "https://..." | null,   # downloaded and uploaded to ComfyUI first
     "input_image_name": "job123.png" | null}   # the name the workflow's LoadImage node uses

Job output:
    {"files": [{"filename", "content_type", "base64"} | {"filename", "content_type", "url"}]}
or {"error": "..."}, which RunPod reports as a failed job.
"""
from __future__ import annotations

import base64
import os
import sys
import uuid

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from wan_api.comfy import ComfyClient, ComfyError, error_message, output_files  # noqa: E402

COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
JOB_TIMEOUT = float(os.environ.get("JOB_TIMEOUT", "1800"))
MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024

comfy = ComfyClient(COMFY_URL)


def s3_upload(data: bytes, filename: str, content_type: str) -> str | None:
    """Uploads to an S3-compatible bucket (e.g. Supabase Storage) if S3_BUCKET is set, returning a signed URL."""
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return None
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL"),
        region_name=os.environ.get("S3_REGION", "auto"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"),
    )
    key = f"{os.environ.get('S3_PREFIX', 'generations')}/{uuid.uuid4().hex}/{filename}"
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key},
                                     ExpiresIn=int(os.environ.get("S3_URL_EXPIRES", "3600")))


def fetch_input_image(url: str) -> bytes:
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as res:
        res.raise_for_status()
        data = b""
        for chunk in res.iter_bytes():
            data += chunk
            if len(data) > MAX_INPUT_IMAGE_BYTES:
                raise ValueError("input image is larger than 20 MB")
    return data


def run(job_input: dict) -> dict:
    workflow = job_input.get("workflow")
    if not isinstance(workflow, dict):
        return {"error": "input.workflow must be a ComfyUI API-format workflow"}

    comfy.wait_until_ready()
    if job_input.get("input_image_url"):
        name = job_input.get("input_image_name") or "input.png"
        comfy.upload_image(fetch_input_image(job_input["input_image_url"]), name)

    entry = comfy.wait_for(comfy.submit(workflow), timeout=JOB_TIMEOUT)
    if err := error_message(entry):
        return {"error": err}

    files = []
    for f in output_files(entry):
        data = comfy.download(f)
        url = s3_upload(data, f.filename, f.content_type)
        out = {"filename": f.filename, "content_type": f.content_type}
        out.update({"url": url} if url else {"base64": base64.b64encode(data).decode()})
        files.append(out)
    if not files:
        return {"error": "The workflow finished without saving any output"}
    return {"files": files}


def handler(job: dict) -> dict:
    try:
        return run(job.get("input") or {})
    except (ComfyError, ValueError, httpx.HTTPError) as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import runpod

    runpod.serverless.start({"handler": handler})
