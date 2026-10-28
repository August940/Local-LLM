import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getProvider } from "./index";
import type { GenerationJob, ProviderStep } from "./types";

const STALE_MINUTES = 20;

type Admin = ReturnType<typeof createAdminClient>;

async function refund(admin: Admin, job: { user_id: string; cost?: number }) {
  const { data } = await admin.from("profiles").select("credits").eq("id", job.user_id).single();
  if (data) await admin.from("profiles").update({ credits: data.credits + (job.cost ?? 1) }).eq("id", job.user_id);
}

async function applyStep(admin: Admin, job: GenerationJob & { cost?: number }, step: ProviderStep, provider: string) {
  if (step.state === "pending") {
    await admin.from("generations").update({ provider, provider_job_id: step.providerJobId }).eq("id", job.id);
    return "pending";
  }
  if (step.state === "failed") {
    await admin
      .from("generations")
      .update({ provider, status: "failed", error: step.error, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    await refund(admin, job);
    return "failed";
  }
  const path = `${job.user_id}/${job.id}.${step.output.ext}`;
  const { error } = await admin.storage
    .from("outputs")
    .upload(path, step.output.data, { contentType: step.output.contentType, upsert: true });
  if (error) {
    await admin
      .from("generations")
      .update({ provider, status: "failed", error: `Storage upload failed: ${error.message}` })
      .eq("id", job.id);
    await refund(admin, job);
    return "failed";
  }
  await admin
    .from("generations")
    .update({ provider, status: "completed", output_path: path, error: null, completed_at: new Date().toISOString() })
    .eq("id", job.id);
  return "completed";
}

async function inputContext(admin: Admin, job: GenerationJob) {
  if (!job.input_path) return { inputUrl: null, inputBytes: null };
  const { data } = await admin.storage.from("inputs").download(job.input_path);
  const { data: signed } = await admin.storage.from("inputs").createSignedUrl(job.input_path, 600);
  return { inputBytes: data ? await data.arrayBuffer() : null, inputUrl: signed?.signedUrl ?? null };
}

/**
 * One pass of the queue: fail stale jobs, poll jobs waiting on the GPU,
 * then claim new jobs up to QUEUE_CONCURRENCY and run them.
 */
export async function processQueue() {
  const admin = createAdminClient();
  const provider = getProvider();
  const concurrency = Math.max(1, Number(process.env.QUEUE_CONCURRENCY ?? 1));
  const summary = { polled: 0, started: 0, completed: 0, failed: 0 };

  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: stale } = await admin
    .from("generations")
    .update({ status: "failed", error: "Timed out on the GPU backend" })
    .eq("status", "processing")
    .lt("started_at", staleBefore)
    .select("user_id, cost");
  for (const job of stale ?? []) await refund(admin, job);

  const { data: waiting } = await admin
    .from("generations")
    .select("*")
    .eq("status", "processing")
    .not("provider_job_id", "is", null);
  for (const job of (waiting ?? []) as GenerationJob[]) {
    summary.polled++;
    try {
      const result = await applyStep(admin, job, await provider.poll(job, job.provider_job_id!), provider.name);
      if (result === "completed") summary.completed++;
      if (result === "failed") summary.failed++;
    } catch (e) {
      console.error("poll failed", job.id, e);
    }
  }

  const { data: claimed, error } = await admin.rpc("claim_generations", { max_jobs: concurrency });
  if (error) throw new Error(`claim_generations failed: ${error.message}`);

  await Promise.all(
    ((claimed ?? []) as GenerationJob[]).map(async (job) => {
      summary.started++;
      try {
        const step = await provider.submit(job, await inputContext(admin, job));
        const result = await applyStep(admin, job, step, provider.name);
        if (result === "completed") summary.completed++;
        if (result === "failed") summary.failed++;
      } catch (e) {
        summary.failed++;
        await applyStep(admin, job, { state: "failed", error: e instanceof Error ? e.message : String(e) }, provider.name);
      }
    }),
  );

  return summary;
}
