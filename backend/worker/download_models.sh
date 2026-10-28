#!/bin/sh
# Downloads the Wan 2.2 model files ComfyUI needs.
# Usage: MODELS_DIR=/runpod-volume/models sh download_models.sh 5b [14b]
set -e
MODELS_DIR="${MODELS_DIR:-/runpod-volume/models}"
HF=https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files

get() {  # get <subdir> <file>
    mkdir -p "$MODELS_DIR/$1"
    if [ -f "$MODELS_DIR/$1/$2" ]; then echo "have $1/$2"; return; fi
    echo "downloading $1/$2"
    wget -q --show-progress -O "$MODELS_DIR/$1/$2.part" "$HF/$1/$2"
    mv "$MODELS_DIR/$1/$2.part" "$MODELS_DIR/$1/$2"
}

[ $# -gt 0 ] || set -- 5b
get text_encoders umt5_xxl_fp8_e4m3fn_scaled.safetensors
for size in "$@"; do
    case "$size" in
        5b)
            get vae wan2.2_vae.safetensors
            get diffusion_models wan2.2_ti2v_5B_fp16.safetensors ;;
        14b)
            get vae wan_2.1_vae.safetensors
            for f in t2v_high_noise t2v_low_noise i2v_high_noise i2v_low_noise; do
                get diffusion_models "wan2.2_${f}_14B_fp8_scaled.safetensors"
            done ;;
        *) echo "unknown model size: $size (use 5b or 14b)"; exit 1 ;;
    esac
done
