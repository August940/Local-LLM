"""Picks a ComfyUI workflow template for a request and fills in its placeholders.

Templates are ComfyUI workflows exported with "Export (API)". Any string value that is
exactly "{{name}}" is replaced with the parameter `name`, keeping its type (so "{{seed}}"
becomes an int). Placeholders inside longer strings are replaced as text.
"""
from __future__ import annotations

import copy
import json
import os
import random
import re
from dataclasses import dataclass
from pathlib import Path

WORKFLOW_DIR = Path(os.environ.get("WORKFLOW_DIR", Path(__file__).parent / "workflows"))

# Wan's own recommended negative prompt (it was trained on Chinese captions).
DEFAULT_NEGATIVE = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，"
    "JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，"
    "手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
)

# Defaults per model size. 5B: 24 fps, 121 frames = 5 s. 14B: 16 fps, 81 frames = 5 s.
MODEL_DEFAULTS = {
    "5b": {"fps": 24, "length": 121, "steps": 30, "base_width": 1280, "base_height": 704},
    "14b": {"fps": 16, "length": 81, "steps": 20, "base_width": 1280, "base_height": 720},
}

ASPECT_RATIOS = {
    "1:1": (1, 1), "16:9": (16, 9), "9:16": (9, 16), "4:3": (4, 3),
    "3:4": (3, 4), "3:2": (3, 2), "2:3": (2, 3), "21:9": (21, 9),
}

PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


class WorkflowError(ValueError):
    """The request can't be turned into a workflow (bad input or missing template)."""


@dataclass
class Request:
    kind: str  # "image" | "video"
    prompt: str
    negative_prompt: str | None = None
    style: str | None = None
    aspect_ratio: str | None = None
    width: int | None = None
    height: int | None = None
    has_input_image: bool = False
    seed: int | None = None


def model_size() -> str:
    size = os.environ.get("WAN_MODEL", "5b").lower()
    if size not in MODEL_DEFAULTS:
        raise WorkflowError(f"WAN_MODEL must be one of {sorted(MODEL_DEFAULTS)}, got {size!r}")
    return size


def template_name(req: Request) -> str:
    """Template file for a request. Override any slot with WORKFLOW_<SLOT>=file.json."""
    if req.kind == "video":
        slot = "i2v" if req.has_input_image else "t2v"
    elif req.kind == "image":
        slot = "i2i" if req.has_input_image else "t2i"
    else:
        raise WorkflowError(f"kind must be 'image' or 'video', got {req.kind!r}")
    override = os.environ.get(f"WORKFLOW_{slot.upper()}")
    if override:
        return override
    if slot == "i2i":
        raise WorkflowError(
            "Image-to-image has no default workflow. Export one from ComfyUI and set WORKFLOW_I2I."
        )
    return f"wan22_{model_size()}_{slot}.json"


def load_template(name: str) -> dict:
    path = Path(name) if os.path.isabs(name) else WORKFLOW_DIR / name
    if not path.is_file():
        raise WorkflowError(f"Workflow template not found: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolve_size(req: Request, base_width: int, base_height: int, multiple: int = 32) -> tuple[int, int]:
    """Width and height snapped to `multiple`, with roughly the area of the base resolution at most."""
    max_area = base_width * base_height
    if req.width and req.height:
        w, h = req.width, req.height
    elif req.aspect_ratio:
        if req.aspect_ratio not in ASPECT_RATIOS:
            raise WorkflowError(f"Unknown aspect_ratio {req.aspect_ratio!r}")
        rw, rh = ASPECT_RATIOS[req.aspect_ratio]
        scale = (max_area / (rw * rh)) ** 0.5
        w, h = rw * scale, rh * scale
    else:
        w, h = base_width, base_height
    if w * h > max_area:
        shrink = (max_area / (w * h)) ** 0.5
        w, h = w * shrink, h * shrink
    snap = lambda v: max(multiple, int(v // multiple) * multiple)
    return snap(w), snap(h)


def build_params(req: Request, input_image_name: str | None = None) -> dict:
    defaults = MODEL_DEFAULTS[model_size()]
    width, height = resolve_size(req, defaults["base_width"], defaults["base_height"])
    prompt = req.prompt.strip()
    if not prompt:
        raise WorkflowError("prompt is empty")
    if req.style:
        prompt = f"{prompt}, {req.style} style"
    steps = defaults["steps"]
    return {
        "prompt": prompt,
        "negative_prompt": req.negative_prompt or DEFAULT_NEGATIVE,
        "width": width,
        "height": height,
        "length": 1 if req.kind == "image" else defaults["length"],
        "fps": float(defaults["fps"]),
        "steps": steps,
        "switch_step": steps // 2,
        "seed": req.seed if req.seed is not None else random.randint(0, 2**48),
        "input_image": input_image_name or "",
    }


def fill(template, params: dict):
    """Returns a copy of `template` with every {{placeholder}} replaced from `params`."""
    if isinstance(template, dict):
        return {k: fill(v, params) for k, v in template.items()}
    if isinstance(template, list):
        return [fill(v, params) for v in template]
    if isinstance(template, str):
        whole = PLACEHOLDER.fullmatch(template)
        if whole:
            key = whole.group(1)
            if key not in params:
                raise WorkflowError(f"Workflow uses unknown placeholder {{{{{key}}}}}")
            return params[key]
        return PLACEHOLDER.sub(lambda m: str(params.get(m.group(1), m.group(0))), template)
    return copy.copy(template)


def build_workflow(req: Request, input_image_name: str | None = None) -> dict:
    """The ComfyUI API prompt for a request, ready to POST to /prompt."""
    template = load_template(template_name(req))
    return fill(template, build_params(req, input_image_name))
