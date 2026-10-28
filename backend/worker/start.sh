#!/bin/sh
# Starts ComfyUI in the background, then the RunPod handler that feeds it jobs.
set -e
python3 /comfyui/main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch --disable-metadata \
    ${COMFY_ARGS} &
exec python3 /app/worker/handler.py
