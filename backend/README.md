# Wan 2.2 generation-API

Backend der laver billeder og videoer med Wan 2.2 i ComfyUI. Du betaler kun for GPU-tid, når nogen faktisk genererer noget.

```
Webside ──HTTP──▶ Gateway (wan_api, FastAPI) ──▶ RunPod serverless endpoint ──▶ ComfyUI + Wan 2.2
                  ingen database, kan køre          worker/ (Docker), starter
                  serverless (Cloud Run m.fl.)      kun når der er jobs
```

| Mappe | Indhold |
|---|---|
| `wan_api/workflows/` | ComfyUI-workflows i API-format med pladsholdere som `{{prompt}}` |
| `wan_api/workflows.py` | Vælger workflow ud fra forespørgslen og udfylder pladsholderne |
| `wan_api/app.py` | HTTP-API'et websiden kalder (`GENERATION_API_URL`) |
| `wan_api/providers.py` | Sender jobs til RunPod serverless, eller direkte til en ComfyUI-server |
| `worker/` | Docker-image til RunPod: ComfyUI + `handler.py` |

## API

Alle kald sender `Authorization: Bearer <GENERATION_API_KEY>`.

`POST /generate`

```json
{"job_id": "abc123", "kind": "video", "prompt": "en rød kjole der svinger",
 "negative_prompt": null, "style": "cinematic", "aspect_ratio": "9:16",
 "width": null, "height": null, "input_image_url": "https://...signeret-url..."}
```

Svar: `{"status": "queued", "id": "<job-id>"}`. Brug `id` fra svaret til status.

`GET /status/{id}` svarer med en af:

- `{"status": "queued" | "processing", "id"}`
- `{"status": "completed", "id", "output_base64", "content_type"}` (eller `output_url`, hvis workeren uploader til S3)
- `{"status": "failed", "id", "error"}`

Valg af workflow:

| kind | input_image_url | Workflow |
|---|---|---|
| video | nej | tekst til video (`wan22_<model>_t2v.json`) |
| video | ja | billede til video (`wan22_<model>_i2v.json`) |
| image | nej | tekst til billede: Wan 2.2 med 1 frame (`wan22_<model>_t2i.json`) |
| image | ja | billede til billede: kræver dit eget workflow i `WORKFLOW_I2I` |

Videoer er 5 sekunder (5B: 121 frames ved 24 fps, 14B: 81 frames ved 16 fps) og gemmes som WebM. Opløsningen afrundes til et multiplum af 32 og holdes under ca. 1280×704.

## Kom i gang

### 1. Byg og push worker-imaget

```bash
cd backend
docker build -f worker/Dockerfile -t <dit-dockerhub-navn>/wan22-worker:1 .
docker push <dit-dockerhub-navn>/wan22-worker:1
```

### 2. Læg modellerne på et RunPod network volume

Opret et network volume på RunPod (ca. 40 GB til 5B, ca. 100 GB til 14B). Start en billig pod med volumet monteret, og kør:

```bash
MODELS_DIR=/workspace/models sh download_models.sh 5b      # eller: 5b 14b
```

(Volumet hedder `/workspace` i en pod og `/runpod-volume` i serverless.) Alternativt kan modellerne bages ind i imaget med `--build-arg WAN_MODELS=5b`. Så slipper du for volumet, men imaget bliver stort og kold-start langsommere.

### 3. Opret et serverless endpoint

På RunPod: **Serverless → New Endpoint**, vælg dit image, tilknyt network volumet, vælg GPU (24 GB, fx RTX 4090/L4/A5000 til 5B; 48 GB+, fx L40S/A6000 til 14B), og sæt **Min workers = 0**, så du ikke betaler når ingen bruger siden. Notér endpoint-id'et.

### 4. Kør gatewayen

```bash
cd backend
cp .env.example .env    # udfyld RUNPOD_ENDPOINT_ID, RUNPOD_API_KEY, GENERATION_API_KEY
pip install -r requirements.txt
set -a; . ./.env; set +a
uvicorn wan_api.app:app --port 8000
```

Test:

```bash
curl -s localhost:8000/generate -H "Authorization: Bearer $GENERATION_API_KEY" \
  -H 'content-type: application/json' -d '{"kind":"image","prompt":"a red dress on a mannequin, studio photo"}'
curl -s localhost:8000/status/<id> -H "Authorization: Bearer $GENERATION_API_KEY"
```

I produktion kan gatewayen køre på fx Google Cloud Run (bruger `Dockerfile` i denne mappe), som også skalerer til nul. Sæt websidens `GENERATION_API_URL` til gatewayens adresse og `GENERATION_API_KEY` til samme hemmelighed.

### Uden serverless

Har du en ComfyUI-server kørende (en RunPod-pod eller din egen maskine), så sæt `BACKEND=comfyui` og `COMFY_URL=http://...:8188`. Så kalder gatewayen ComfyUI direkte.

## Brug dine egne workflows

1. Byg workflowet i ComfyUI og vælg **Workflow → Export (API)**.
2. Erstat de værdier, der skal komme fra websiden, med pladsholdere: `{{prompt}}`, `{{negative_prompt}}`, `{{width}}`, `{{height}}`, `{{length}}`, `{{fps}}`, `{{steps}}`, `{{seed}}`, `{{switch_step}}` og `{{input_image}}` (filnavnet i en LoadImage-node).
3. Læg filen i `wan_api/workflows/` og peg på den med `WORKFLOW_T2V`, `WORKFLOW_I2V`, `WORKFLOW_T2I` eller `WORKFLOW_I2I`.
4. Bruger workflowet custom nodes, skal de installeres i `worker/Dockerfile` (klon dem ind i `/comfyui/custom_nodes/`), og modellerne skal ligge på volumet.

## Lagring af resultater (valgfrit)

Som standard returnerer workeren filen som base64. Til større videoer kan workeren uploade til en S3-kompatibel bucket (fx Supabase Storage) og returnere en signeret URL. Sæt disse miljøvariabler på RunPod-endpointet: `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, og evt. `S3_REGION`, `S3_PREFIX`, `S3_URL_EXPIRES`.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

Testene kører uden GPU og bruger falske RunPod- og ComfyUI-servere.
