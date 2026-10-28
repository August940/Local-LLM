import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from wan_api import app as app_module
from wan_api.comfy import ComfyClient
from wan_api.providers import ComfyDirectProvider, RunPodProvider


def make_client(provider, monkeypatch, key="secret"):
    monkeypatch.setenv("WAN_MODEL", "5b")
    monkeypatch.setenv("GENERATION_API_KEY", key)
    app_module.app.dependency_overrides[app_module.get_provider] = lambda: provider
    return TestClient(app_module.app, headers={"Authorization": f"Bearer {key}"})


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app_module.app.dependency_overrides.clear()


class FakeRunPod:
    def __init__(self):
        self.jobs = {}

    def __call__(self, request: httpx.Request):
        if request.method == "POST" and request.url.path.endswith("/run"):
            self.jobs["job-1"] = json.loads(request.content)["input"]
            return httpx.Response(200, json={"id": "job-1", "status": "IN_QUEUE"})
        job_id = request.url.path.rsplit("/", 1)[-1]
        if job_id == "queued":
            return httpx.Response(200, json={"id": job_id, "status": "IN_QUEUE"})
        if job_id == "broken":
            return httpx.Response(200, json={"id": job_id, "status": "COMPLETED", "output": {"error": "OOM"}})
        return httpx.Response(200, json={"id": job_id, "status": "COMPLETED", "output": {"files": [
            {"filename": "v.webm", "content_type": "video/webm", "base64": "AAA="}]}})


def test_runpod_flow(monkeypatch):
    fake = FakeRunPod()
    provider = RunPodProvider("ep", "k", http=httpx.Client(base_url="https://rp", transport=httpx.MockTransport(fake)))
    client = make_client(provider, monkeypatch)

    res = client.post("/generate", json={
        "job_id": "abc/../1", "kind": "video", "prompt": "a red dress twirling", "aspect_ratio": "9:16",
        "input_image_url": "https://example.com/in.png"})
    assert res.json() == {"status": "queued", "id": "job-1"}
    sent = fake.jobs["job-1"]
    assert sent["input_image_url"] == "https://example.com/in.png"
    assert sent["input_image_name"] == "abc1.png" == sent["workflow"]["57"]["inputs"]["image"]

    assert client.get("/status/queued").json() == {"status": "queued", "id": "queued"}
    assert client.get("/status/job-1").json() == {
        "status": "completed", "id": "job-1", "output_base64": "AAA=", "content_type": "video/webm"}
    assert client.get("/status/broken").json() == {"status": "failed", "id": "broken", "error": "OOM"}


def test_auth_and_validation(monkeypatch):
    client = make_client(object(), monkeypatch)
    assert client.post("/generate", json={"kind": "image", "prompt": "x"},
                       headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/generate", json={"kind": "audio", "prompt": "x"}).status_code == 422
    res = client.post("/generate", json={"kind": "image", "prompt": "x", "input_image_url": "https://e/x.png"})
    assert res.status_code == 400 and res.json()["status"] == "failed"


def test_comfy_direct_flow(monkeypatch):
    history = {}

    def comfy(request: httpx.Request):
        path = request.url.path
        if path == "/prompt":
            assert json.loads(request.content)["prompt"]["9"]["class_type"] == "SaveImage"
            return httpx.Response(200, json={"prompt_id": "p1"})
        if path == "/history/p1":
            return httpx.Response(200, json=history)
        if path == "/queue":
            return httpx.Response(200, json={"queue_running": [], "queue_pending": [[0, "p1", {}, {}, []]]})
        if path == "/view":
            assert request.url.params["subfolder"] == "wan22"
            return httpx.Response(200, content=b"PNGDATA")
        return httpx.Response(404)

    http = httpx.Client(base_url="http://comfy", transport=httpx.MockTransport(comfy))
    client = make_client(ComfyDirectProvider(ComfyClient("http://comfy", http=http)), monkeypatch)

    assert client.post("/generate", json={"kind": "image", "prompt": "x"}).json() == {"status": "queued", "id": "p1"}
    assert client.get("/status/p1").json() == {"status": "queued", "id": "p1"}

    history["p1"] = {"status": {"status_str": "success", "completed": True}, "outputs": {
        "9": {"images": [{"filename": "image_00001_.png", "subfolder": "wan22", "type": "output"}]}}}
    assert client.get("/status/p1").json() == {
        "status": "completed", "id": "p1", "content_type": "image/png",
        "output_base64": base64.b64encode(b"PNGDATA").decode()}

    history["p1"] = {"status": {"status_str": "error", "completed": False, "messages": [
        ["execution_error", {"node_type": "KSampler", "exception_message": "CUDA out of memory"}]]}, "outputs": {}}
    assert client.get("/status/p1").json() == {"status": "failed", "id": "p1", "error": "KSampler: CUDA out of memory"}
