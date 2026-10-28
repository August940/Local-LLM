import { SAFETY_NEGATIVE_PROMPT } from "@/lib/policy";
import type { GenerationJob, GenerationProvider, ProviderStep } from "./types";

/**
 * Generic HTTP backend: the serverless Python service that wraps the exported
 * ComfyUI / Wan 2.2 workflow plugs in here. Contract (JSON):
 *
 *   POST {GENERATION_API_URL}/generate
 *     { job_id, kind, prompt, negative_prompt, style, aspect_ratio, width, height, input_image_url }
 *   GET  {GENERATION_API_URL}/status/{id}   (id = the one returned by /generate)
 *
 * Both return one of:
 *   { status: "queued" | "processing", id }
 *   { status: "completed", output_url } or { status: "completed", output_base64, content_type }
 *   { status: "failed", error }
 */

type ApiResponse = {
  status: "queued" | "processing" | "completed" | "failed";
  id?: string;
  output_url?: string;
  output_base64?: string;
  content_type?: string;
  error?: string;
};

function baseUrl() {
  const url = process.env.GENERATION_API_URL;
  if (!url) throw new Error("GENERATION_API_URL is not set");
  return url.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.GENERATION_API_KEY) h.Authorization = `Bearer ${process.env.GENERATION_API_KEY}`;
  return h;
}

function dimensions(aspect: string, kind: "image" | "video") {
  const long = kind === "video" ? 704 : 1216;
  const [w, h] = aspect.split(":").map(Number);
  const ratio = w && h ? w / h : 3 / 4;
  const round = (n: number) => Math.max(256, Math.round(n / 32) * 32);
  return ratio >= 1 ? { width: round(long), height: round(long / ratio) } : { width: round(long * ratio), height: round(long) };
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

async function toStep(res: Response, fallbackId?: string): Promise<ProviderStep> {
  if (!res.ok) {
    // While polling, a non-2xx is a transient upstream error: keep the job and retry on the next tick
    // (the queue's stale-job timeout still fails it eventually). Only a 200 with status "failed" is final.
    if (fallbackId) return { state: "pending", providerJobId: fallbackId };
    return { state: "failed", error: `Generation API error ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const body = (await res.json()) as ApiResponse;
  if (body.status === "failed") return { state: "failed", error: body.error ?? "Generation failed" };
  if (body.status !== "completed") {
    const id = body.id ?? fallbackId;
    return id ? { state: "pending", providerJobId: id } : { state: "failed", error: "Generation API returned no job id" };
  }
  if (body.output_base64) {
    const contentType = body.content_type ?? "image/png";
    return {
      state: "done",
      output: { data: Buffer.from(body.output_base64, "base64"), contentType, ext: EXT[contentType] ?? "png" },
    };
  }
  if (body.output_url) {
    const file = await fetch(body.output_url);
    if (!file.ok) return { state: "failed", error: `Could not download output (${file.status})` };
    const contentType = file.headers.get("content-type")?.split(";")[0] ?? body.content_type ?? "image/png";
    return { state: "done", output: { data: await file.arrayBuffer(), contentType, ext: EXT[contentType] ?? "png" } };
  }
  return { state: "failed", error: "Generation API returned no output" };
}

export const httpProvider: GenerationProvider = {
  name: "api",
  async submit(job: GenerationJob, ctx): Promise<ProviderStep> {
    const { width, height } = dimensions(job.aspect_ratio, job.kind);
    const res = await fetch(`${baseUrl()}/generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        job_id: job.id,
        kind: job.kind,
        prompt: job.prompt,
        negative_prompt: [job.negative_prompt, SAFETY_NEGATIVE_PROMPT].filter(Boolean).join(", "),
        style: job.style,
        aspect_ratio: job.aspect_ratio,
        width,
        height,
        input_image_url: ctx.inputUrl,
      }),
    });
    return toStep(res);
  },
  async poll(_job, providerJobId) {
    const res = await fetch(`${baseUrl()}/status/${encodeURIComponent(providerJobId)}`, {
      headers: headers(),
      cache: "no-store",
    });
    return toStep(res, providerJobId);
  },
};
