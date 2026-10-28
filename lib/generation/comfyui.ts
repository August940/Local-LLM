import { readFile } from "node:fs/promises";
import path from "node:path";
import { SAFETY_NEGATIVE_PROMPT } from "@/lib/policy";
import type { GenerationJob, GenerationOutput, GenerationProvider, JobContext, ProviderStep } from "./types";

const STYLE_HINTS: Record<string, string> = {
  editorial: "high fashion editorial photo, studio lighting, magazine cover quality",
  runway: "runway show photo, catwalk, professional fashion photography",
  sketch: "fashion design sketch, croquis, marker and ink illustration, white paper",
  streetwear: "streetwear lookbook photo, urban background, natural light",
  bridal: "bridal couture gown, elegant, soft natural light, detailed lace",
  flatlay: "flat lay product photo of the garment, clean white background",
};

function baseUrl() {
  const url = process.env.COMFYUI_URL;
  if (!url) throw new Error("COMFYUI_URL is not set");
  return url.replace(/\/$/, "");
}

function headers(extra?: Record<string, string>) {
  const h: Record<string, string> = { ...extra };
  if (process.env.COMFYUI_API_KEY) h.Authorization = `Bearer ${process.env.COMFYUI_API_KEY}`;
  return h;
}

function dimensions(aspect: string, kind: "image" | "video") {
  const long = kind === "video" ? 704 : 1216;
  const [w, h] = aspect.split(":").map(Number);
  const ratio = w && h ? w / h : 3 / 4;
  const round = (n: number) => Math.max(256, Math.round(n / 32) * 32);
  return ratio >= 1 ? { width: round(long), height: round(long / ratio) } : { width: round(long * ratio), height: round(long) };
}

async function loadWorkflow(name: string, values: Record<string, string | number>) {
  const raw = await readFile(path.join(process.cwd(), "workflows", `${name}.json`), "utf8");
  // Replace "{{KEY}}" placeholders; numbers become JSON numbers, text is JSON-escaped.
  const filled = raw.replace(/"\{\{(\w+)\}\}"/g, (_, key: string) => JSON.stringify(values[key] ?? ""));
  return JSON.parse(filled);
}

async function uploadInput(bytes: ArrayBuffer, jobId: string) {
  const form = new FormData();
  form.append("image", new Blob([bytes]), `dressmaker-${jobId}.png`);
  form.append("overwrite", "true");
  const res = await fetch(`${baseUrl()}/upload/image`, { method: "POST", body: form, headers: headers() });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status}`);
  const json = (await res.json()) as { name: string; subfolder?: string };
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
}

type HistoryFile = { filename: string; subfolder: string; type: string };

async function fetchOutput(file: HistoryFile): Promise<GenerationOutput> {
  const qs = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
  const res = await fetch(`${baseUrl()}/view?${qs}`, { headers: headers() });
  if (!res.ok) throw new Error(`ComfyUI /view failed: ${res.status}`);
  const ext = file.filename.split(".").pop()?.toLowerCase() ?? "png";
  const contentType =
    res.headers.get("content-type") ??
    ({ mp4: "video/mp4", webm: "video/webm", webp: "image/webp", jpg: "image/jpeg" }[ext] || "image/png");
  return { data: await res.arrayBuffer(), contentType, ext };
}

async function checkHistory(promptId: string): Promise<ProviderStep> {
  const res = await fetch(`${baseUrl()}/history/${promptId}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return { state: "pending", providerJobId: promptId };
  const history = (await res.json()) as Record<string, any>;
  const entry = history[promptId];
  if (!entry) return { state: "pending", providerJobId: promptId };
  if (entry.status?.status_str === "error") {
    return { state: "failed", error: "ComfyUI reported an error while running the workflow" };
  }
  for (const node of Object.values<any>(entry.outputs ?? {})) {
    const files: HistoryFile[] = node.videos ?? node.gifs ?? node.images ?? [];
    const file = files.find((f) => f.type !== "temp") ?? files[0];
    if (file) return { state: "done", output: await fetchOutput(file) };
  }
  return entry.status?.completed
    ? { state: "failed", error: "Workflow finished without an output" }
    : { state: "pending", providerJobId: promptId };
}

/**
 * Cloud ComfyUI backend (RunPod / Vast.ai / own server). Workflows live in
 * /workflows as API-format JSON with {{PLACEHOLDERS}}.
 */
export const comfyProvider: GenerationProvider = {
  name: "comfyui",
  async submit(job: GenerationJob, ctx: JobContext): Promise<ProviderStep> {
    const { width, height } = dimensions(job.aspect_ratio, job.kind);
    const style = job.style ? STYLE_HINTS[job.style] : undefined;
    const values: Record<string, string | number> = {
      PROMPT: [job.prompt, style, "fully clothed adult model, fashion design"].filter(Boolean).join(", "),
      NEGATIVE: [job.negative_prompt, SAFETY_NEGATIVE_PROMPT].filter(Boolean).join(", "),
      SEED: Math.floor(Math.random() * 2 ** 31),
      WIDTH: width,
      HEIGHT: height,
    };

    let workflowName = job.kind === "video" ? "video" : "image";
    if (ctx.inputBytes) {
      values.INPUT_IMAGE = await uploadInput(ctx.inputBytes, job.id);
      if (job.kind === "image") workflowName = "image_ref";
    }
    const workflow = await loadWorkflow(workflowName, values);
    if (job.kind === "video" && values.INPUT_IMAGE) {
      // Image-to-video: feed the reference image as the first frame.
      workflow["90"] = { class_type: "LoadImage", inputs: { image: values.INPUT_IMAGE } };
      workflow["55"].inputs.start_image = ["90", 0];
    }

    const res = await fetch(`${baseUrl()}/prompt`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prompt: workflow, client_id: `dressmaker-${job.id}` }),
    });
    if (!res.ok) {
      return { state: "failed", error: `ComfyUI rejected the workflow (${res.status}): ${(await res.text()).slice(0, 300)}` };
    }
    const { prompt_id } = (await res.json()) as { prompt_id: string };

    // Wait briefly so fast image jobs finish in one tick; long jobs are polled later.
    const deadline = Date.now() + (job.kind === "video" ? 5_000 : 45_000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const step = await checkHistory(prompt_id);
      if (step.state !== "pending") return step;
    }
    return { state: "pending", providerJobId: prompt_id };
  },
  async poll(_job, providerJobId) {
    return checkHistory(providerJobId);
  },
};
