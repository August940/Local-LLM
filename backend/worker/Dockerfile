# RunPod serverless worker: ComfyUI + the handler in handler.py.
# Build from the backend/ directory:  docker build -f worker/Dockerfile -t wan22-worker .
# Models are read from a RunPod network volume (/runpod-volume/models) by default.
# To bake them into the image instead:  --build-arg WAN_MODELS=5b   (or 14b, or "5b 14b")
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ARG COMFYUI_VERSION=v0.42.5
ARG WAN_MODELS=""

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-dev git wget ca-certificates ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${COMFYUI_VERSION} https://github.com/comfyanonymous/ComfyUI /comfyui \
    && pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128 \
    && pip install -r /comfyui/requirements.txt

WORKDIR /app
COPY worker/requirements.txt worker/requirements.txt
RUN pip install -r worker/requirements.txt

COPY worker/extra_model_paths.yaml /comfyui/extra_model_paths.yaml
COPY worker/download_models.sh worker/download_models.sh
RUN if [ -n "$WAN_MODELS" ]; then MODELS_DIR=/comfyui/models sh worker/download_models.sh $WAN_MODELS; fi

COPY wan_api wan_api
COPY worker worker
RUN chmod +x worker/start.sh

CMD ["/app/worker/start.sh"]
