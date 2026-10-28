"""HTTP gateway the website calls (GENERATION_API_URL).

POST /generate      -> {"status": "queued", "id"}            submit a job
GET  /status/{id}   -> {"status": "queued"|"processing", "id"}
                     | {"status": "completed", "id", "output_url"}
                     | {"status": "completed", "id", "output_base64", "content_type"}
                     | {"status": "failed", "id"?, "error"}

Requests must send "Authorization: Bearer <GENERATION_API_KEY>" when that variable is set.
Run locally: uvicorn wan_api.app:app --port 8000
"""
from __future__ import annotations

import hmac
import logging
import os
import re
import uuid
from functools import lru_cache
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import providers
from .comfy import ComfyError
from .workflows import Request, WorkflowError, build_workflow

log = logging.getLogger("wan_api")
app = FastAPI(title="Wan 2.2 generation API")


class GenerateBody(BaseModel):
    job_id: str | None = None
    kind: Literal["image", "video"]
    prompt: str = Field(min_length=1, max_length=4000)
    negative_prompt: str | None = Field(default=None, max_length=4000)
    style: str | None = Field(default=None, max_length=200)
    aspect_ratio: str | None = None
    width: int | None = Field(default=None, ge=64, le=4096)
    height: int | None = Field(default=None, ge=64, le=4096)
    input_image_url: str | None = None
    seed: int | None = Field(default=None, ge=0)


@lru_cache
def get_provider():
    return providers.from_env()


def check_auth(authorization: str | None = Header(default=None)) -> None:
    key = os.environ.get("GENERATION_API_KEY")
    if not key:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, key):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


def failed(error: str, code: int, job_id: str | None = None) -> JSONResponse:
    body = {"status": "failed", "error": error}
    if job_id:
        body["id"] = job_id
    return JSONResponse(body, status_code=code)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/generate", dependencies=[Depends(check_auth)])
def generate(body: GenerateBody, provider=Depends(get_provider)):
    req = Request(
        kind=body.kind, prompt=body.prompt, negative_prompt=body.negative_prompt, style=body.style,
        aspect_ratio=body.aspect_ratio, width=body.width, height=body.height,
        has_input_image=bool(body.input_image_url), seed=body.seed,
    )
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", body.job_id or "")[:64] or uuid.uuid4().hex
    try:
        workflow = build_workflow(req, input_image_name=f"{safe_id}.png" if body.input_image_url else None)
    except WorkflowError as e:
        return failed(str(e), 400)
    try:
        return provider.submit(workflow, body.input_image_url)
    except (ComfyError, httpx.HTTPError) as e:
        log.exception("submit failed")
        return failed(f"could not submit job: {e}", 502)


@app.get("/status/{job_id}", dependencies=[Depends(check_auth)])
def status(job_id: str, provider=Depends(get_provider)):
    try:
        return provider.status(job_id)
    except (ComfyError, httpx.HTTPError) as e:
        log.exception("status failed")
        return failed(f"could not fetch status: {e}", 502, job_id)
