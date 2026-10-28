import json

import pytest

from wan_api import workflows
from wan_api.workflows import Request, WorkflowError, build_workflow, resolve_size

TEMPLATES = sorted(p.name for p in workflows.WORKFLOW_DIR.glob("*.json"))


@pytest.mark.parametrize("name", TEMPLATES)
def test_templates_fill_completely(name, monkeypatch):
    monkeypatch.setenv("WAN_MODEL", "14b" if "14b" in name else "5b")
    kind = "image" if name.endswith("t2i.json") else "video"
    req = Request(kind=kind, prompt="a fox", has_input_image="i2v" in name, seed=7)
    wf = workflows.fill(workflows.load_template(name), workflows.build_params(req, "in.png"))

    assert "{{" not in json.dumps(wf, ensure_ascii=False)
    for node_id, node in wf.items():
        for value in node["inputs"].values():
            if isinstance(value, list):  # a link: [source node id, output index]
                assert value[0] in wf, f"{name}: node {node_id} links to missing node {value[0]}"
    samplers = [n for n in wf.values() if n["class_type"] in ("KSampler", "KSamplerAdvanced")]
    assert samplers and all(isinstance(n["inputs"]["steps"], int) for n in samplers)


def test_template_choice(monkeypatch):
    monkeypatch.setenv("WAN_MODEL", "5b")
    assert workflows.template_name(Request("video", "x")) == "wan22_5b_t2v.json"
    assert workflows.template_name(Request("video", "x", has_input_image=True)) == "wan22_5b_i2v.json"
    assert workflows.template_name(Request("image", "x")) == "wan22_5b_t2i.json"
    with pytest.raises(WorkflowError):
        workflows.template_name(Request("image", "x", has_input_image=True))
    monkeypatch.setenv("WORKFLOW_I2I", "my_flux_img2img.json")
    assert workflows.template_name(Request("image", "x", has_input_image=True)) == "my_flux_img2img.json"


def test_image_is_single_frame_and_prompt_has_style(monkeypatch):
    monkeypatch.setenv("WAN_MODEL", "5b")
    wf = build_workflow(Request("image", "a dress", style="watercolor", aspect_ratio="1:1", seed=1))
    assert wf["55"]["inputs"]["length"] == 1
    assert wf["6"]["inputs"]["text"] == "a dress, watercolor style"
    assert wf["9"]["class_type"] == "SaveImage"


def test_i2v_uses_given_image_name(monkeypatch):
    monkeypatch.setenv("WAN_MODEL", "14b")
    wf = build_workflow(Request("video", "walk", has_input_image=True), input_image_name="job1.png")
    assert wf["52"]["inputs"]["image"] == "job1.png"
    assert wf["57"]["inputs"]["end_at_step"] == wf["58"]["inputs"]["start_at_step"] == 10


@pytest.mark.parametrize("ratio", list(workflows.ASPECT_RATIOS))
def test_sizes_are_snapped_and_capped(ratio):
    w, h = resolve_size(Request("image", "x", aspect_ratio=ratio), 1280, 704)
    assert w % 32 == 0 and h % 32 == 0
    assert w * h <= 1280 * 704


def test_explicit_size_is_capped():
    assert resolve_size(Request("image", "x", width=4096, height=4096), 1280, 704) == (928, 928)
    assert resolve_size(Request("image", "x", width=512, height=768), 1280, 704) == (512, 768)
    with pytest.raises(WorkflowError):
        resolve_size(Request("image", "x", aspect_ratio="5:1"), 1280, 704)
