import httpx

from wan_api.comfy import ComfyClient
from worker import handler as worker


def test_handler_returns_files(monkeypatch):
    def comfy(request: httpx.Request):
        path = request.url.path
        if path == "/system_stats":
            return httpx.Response(200, json={})
        if path == "/prompt":
            return httpx.Response(200, json={"prompt_id": "p"})
        if path == "/history/p":
            return httpx.Response(200, json={"p": {"status": {"status_str": "success", "completed": True}, "outputs": {
                "9": {"images": [{"filename": "v_00001_.webm", "subfolder": "wan22", "type": "output"}],
                      "animated": [True]}}}})
        if path == "/view":
            return httpx.Response(200, content=b"WEBM")
        return httpx.Response(404)

    http = httpx.Client(base_url="http://c", transport=httpx.MockTransport(comfy))
    monkeypatch.setattr(worker, "comfy", ComfyClient("http://c", http=http))
    monkeypatch.delenv("S3_BUCKET", raising=False)

    out = worker.handler({"input": {"workflow": {"1": {"class_type": "X", "inputs": {}}}}})
    assert out == {"files": [{"filename": "v_00001_.webm", "content_type": "video/webm", "base64": "V0VCTQ=="}]}
    assert worker.handler({"input": {}}) == {"error": "input.workflow must be a ComfyUI API-format workflow"}
