"""Where workflows run: a RunPod serverless endpoint (pay per job) or a ComfyUI server you run yourself.

Both are stateless: the job id returned to the client is the provider's own id, so the
gateway keeps no database and can itself run serverless.
"""
from __future__ import annotations

import base64
import os
import uuid

import httpx

from .comfy import ComfyClient, error_message, output_files

Status = dict  # {"status": ..., "id"?, "output_url"?, "output_base64"?, "content_type"?, "error"?}


class RunPodProvider:
    """Sends jobs to the worker in backend/worker deployed as a RunPod serverless endpoint."""

    def __init__(self, endpoint_id: str, api_key: str, http: httpx.Client | None = None):
        self.http = http or httpx.Client(
            base_url=f"https://api.runpod.ai/v2/{endpoint_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )

    def submit(self, workflow: dict, input_image_url: str | None) -> Status:
        job_input = {"workflow": workflow}
        if input_image_url:
            job_input |= {"input_image_url": input_image_url, "input_image_name": _image_name(workflow)}
        res = self.http.post("/run", json={"input": job_input})
        res.raise_for_status()
        return {"status": "queued", "id": res.json()["id"]}

    def status(self, job_id: str) -> Status:
        res = self.http.get(f"/status/{job_id}")
        if res.status_code == 404:
            return {"status": "failed", "id": job_id, "error": "unknown job id (results expire after ~30 min)"}
        res.raise_for_status()
        body = res.json()
        state = body.get("status")
        if state == "IN_QUEUE":
            return {"status": "queued", "id": job_id}
        if state == "IN_PROGRESS":
            return {"status": "processing", "id": job_id}
        if state == "COMPLETED":
            output = body.get("output") or {}
            if output.get("error"):
                return {"status": "failed", "id": job_id, "error": output["error"]}
            files = output.get("files") or []
            if not files:
                return {"status": "failed", "id": job_id, "error": "worker returned no files"}
            return _completed(job_id, files[0])
        return {"status": "failed", "id": job_id, "error": body.get("error") or f"job {state.lower()}"}


class ComfyDirectProvider:
    """Talks straight to a ComfyUI server, e.g. a RunPod pod or your own GPU machine."""

    def __init__(self, comfy: ComfyClient, http: httpx.Client | None = None):
        self.comfy = comfy
        self.http = http or httpx.Client(timeout=60, follow_redirects=True)

    def submit(self, workflow: dict, input_image_url: str | None) -> Status:
        if input_image_url:
            res = self.http.get(input_image_url)
            res.raise_for_status()
            self.comfy.upload_image(res.content, _image_name(workflow))
        return {"status": "queued", "id": self.comfy.submit(workflow)}

    def status(self, job_id: str) -> Status:
        entry = self.comfy.history(job_id)
        if not entry:  # ComfyUI only adds a history entry once the prompt has finished
            return {"status": "queued" if self.comfy.is_queued(job_id) else "processing", "id": job_id}
        if err := error_message(entry):
            return {"status": "failed", "id": job_id, "error": err}
        files = output_files(entry)
        if not files:
            return {"status": "failed", "id": job_id, "error": "the workflow saved no output"}
        f = files[0]
        data = base64.b64encode(self.comfy.download(f)).decode()
        return _completed(job_id, {"base64": data, "content_type": f.content_type})


def _completed(job_id: str, f: dict) -> Status:
    if f.get("url"):
        return {"status": "completed", "id": job_id, "output_url": f["url"]}
    return {"status": "completed", "id": job_id, "output_base64": f["base64"],
            "content_type": f.get("content_type", "application/octet-stream")}


def _image_name(workflow: dict) -> str:
    """The file name the workflow's LoadImage node expects."""
    for node in workflow.values():
        if node.get("class_type") == "LoadImage" and node["inputs"].get("image"):
            return node["inputs"]["image"]
    return f"{uuid.uuid4().hex}.png"


def from_env():
    kind = os.environ.get("BACKEND", "runpod")
    if kind == "runpod":
        endpoint, key = os.environ.get("RUNPOD_ENDPOINT_ID"), os.environ.get("RUNPOD_API_KEY")
        if not endpoint or not key:
            raise RuntimeError("BACKEND=runpod needs RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY")
        return RunPodProvider(endpoint, key)
    if kind == "comfyui":
        return ComfyDirectProvider(ComfyClient(os.environ.get("COMFY_URL", "http://127.0.0.1:8188")))
    raise RuntimeError(f"BACKEND must be 'runpod' or 'comfyui', got {kind!r}")
