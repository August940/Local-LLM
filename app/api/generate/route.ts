import { after, NextResponse } from "next/server";
import { processQueue } from "@/lib/generation/queue";
import { COST, getPlan } from "@/lib/plans";
import { checkPrompt } from "@/lib/policy";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const STYLES = new Set(["editorial", "runway", "sketch", "streetwear", "bridal", "flatlay"]);
const ASPECTS = new Set(["1:1", "3:4", "4:5", "9:16", "16:9"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = String(body.prompt ?? "").trim();
  const negative = String(body.negative_prompt ?? "").trim() || null;
  const kind = body.kind === "video" ? "video" : "image";
  const style = typeof body.style === "string" && STYLES.has(body.style) ? body.style : null;
  const aspect = typeof body.aspect_ratio === "string" && ASPECTS.has(body.aspect_ratio) ? body.aspect_ratio : "3:4";
  const inputPath = typeof body.input_path === "string" && body.input_path ? body.input_path : null;
  const isPublic = body.is_public === true;

  if (prompt.length < 3) return NextResponse.json({ error: "Describe the outfit in a few words." }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt is too long (max 2000 characters)." }, { status: 400 });

  const policy = checkPrompt(prompt, negative);
  if (!policy.ok) {
    return NextResponse.json({ error: policy.message, policy: policy.category }, { status: 422 });
  }

  if (inputPath && !inputPath.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: "Invalid reference image." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("plan_id").eq("id", auth.user.id).single();
  const plan = getPlan(profile?.plan_id);
  if (kind === "video" && !plan.allowVideo) {
    return NextResponse.json({ error: "Video generation is part of the Creator and Studio plans." }, { status: 402 });
  }

  const cost = COST[kind];
  const { error: spendError } = await admin.rpc("spend_credits", { uid: auth.user.id, amount: cost });
  if (spendError) {
    const msg = spendError.message.includes("insufficient_credits")
      ? "You are out of credits. Upgrade your plan to keep designing."
      : spendError.message;
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  const { data: job, error } = await admin
    .from("generations")
    .insert({
      user_id: auth.user.id,
      kind,
      prompt,
      negative_prompt: negative,
      style,
      aspect_ratio: aspect,
      input_path: inputPath,
      priority: plan.priority,
      cost,
      is_public: isPublic && plan.id !== "free",
    })
    .select()
    .single();

  if (error || !job) {
    // give the credits back if the insert failed
    const { data: p } = await admin.from("profiles").select("credits").eq("id", auth.user.id).single();
    if (p) await admin.from("profiles").update({ credits: p.credits + cost }).eq("id", auth.user.id);
    return NextResponse.json({ error: error?.message ?? "Could not queue the job." }, { status: 500 });
  }

  // Kick the worker after the response is sent; a cron hitting /api/queue/tick is the backup.
  after(async () => {
    try {
      await processQueue();
    } catch (e) {
      console.error("queue tick failed", e);
    }
  });

  return NextResponse.json({ job }, { status: 201 });
}
