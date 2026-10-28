"""Minimal client for ComfyUI's HTTP API, shared by the serverless worker and the gateway."""
from __future__ import annotations

import mimetypes
import time
import uuid
from dataclasses import dataclass

import httpx


class ComfyError(RuntimeError):
    pass


@dataclass
class OutputFile:
    filename: str
    subfolder: str
    type: str

    @property
    def content_type(self) -> str:
        return mimetypes.guess_type(self.filename)[0] or "application/octet-stream"


class ComfyClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8188", timeout: float = 60.0,
                 http: httpx.Client | None = None):
        self.base_url = base_url.rstrip("/")
        self.http = http or httpx.Client(base_url=self.base_url, timeout=timeout)
        self.client_id = str(uuid.uuid4())

    def wait_until_ready(self, timeout: float = 300.0, interval: float = 0.5) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if self.http.get("/system_stats").status_code == 200:
                    return
            except httpx.TransportError:
                pass
            time.sleep(interval)
        raise ComfyError(f"ComfyUI did not start within {timeout:.0f}s")

    def upload_image(self, data: bytes, name: str) -> str:
        """Uploads an input image and returns the name to put in a LoadImage node."""
        res = self.http.post("/upload/image", files={"image": (name, data)}, data={"overwrite": "true"})
        res.raise_for_status()
        body = res.json()
        return f"{body['subfolder']}/{body['name']}" if body.get("subfolder") else body["name"]

    def submit(self, workflow: dict) -> str:
        res = self.http.post("/prompt", json={"prompt": workflow, "client_id": self.client_id})
        if res.status_code != 200:
            # ComfyUI answers 400 with node_errors when the workflow doesn't validate.
            raise ComfyError(f"ComfyUI rejected the workflow: {res.text[:2000]}")
        return res.json()["prompt_id"]

    def history(self, prompt_id: str) -> dict | None:
        res = self.http.get(f"/history/{prompt_id}")
        res.raise_for_status()
        return res.json().get(prompt_id)

    def is_queued(self, prompt_id: str) -> bool:
        """True while the prompt waits in the queue, False once it runs (or is unknown)."""
        res = self.http.get("/queue")
        res.raise_for_status()
        return any(item[1] == prompt_id for item in res.json().get("queue_pending", []))

    def wait_for(self, prompt_id: str, timeout: float = 1800.0, interval: float = 1.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            entry = self.history(prompt_id)
            if entry:  # added to the history once the prompt has finished, successfully or not
                return entry
            time.sleep(interval)
        raise ComfyError(f"Prompt {prompt_id} did not finish within {timeout:.0f}s")

    def download(self, f: OutputFile) -> bytes:
        res = self.http.get("/view", params={"filename": f.filename, "subfolder": f.subfolder, "type": f.type})
        res.raise_for_status()
        return res.content


def error_message(entry: dict) -> str | None:
    """The execution error of a finished history entry, or None if it succeeded."""
    status = entry.get("status", {})
    if status.get("status_str") != "error":
        return None
    for kind, data in status.get("messages", []):
        if kind == "execution_error":
            return f"{data.get('node_type')}: {data.get('exception_message', '').strip()}"
    return "ComfyUI reported an error"


def output_files(entry: dict) -> list[OutputFile]:
    """Saved output files of a history entry (images, videos, animated WEBP...)."""
    files = []
    for node_output in entry.get("outputs", {}).values():
        for value in node_output.values():
            if not isinstance(value, list):
                continue
            for item in value:
                if isinstance(item, dict) and "filename" in item and item.get("type") == "output":
                    files.append(OutputFile(item["filename"], item.get("subfolder", ""), item["type"]))
    return files
