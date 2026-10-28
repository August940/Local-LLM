import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/plans";

type Ctx = { params: Promise<{ id: string }> };

/** Toggle whether a finished creation is shared on Explore. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { is_public?: boolean };
  if (body.is_public) {
    const { data: profile } = await supabase.from("profiles").select("plan_id").eq("id", auth.user.id).single();
    if (getPlan(profile?.plan_id).id === "free") {
      return NextResponse.json({ error: "Publishing to Explore is part of the Creator plan." }, { status: 402 });
    }
  }
  const { data, error } = await supabase
    .from("generations")
    .update({ is_public: Boolean(body.is_public) })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, is_public")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** Delete a creation and its stored files. */
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("generations")
    .select("id, status, input_path, output_path")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.status === "queued") {
    // Cancelling a queued job refunds its credits.
    const admin = createAdminClient();
    const { data: job } = await admin.from("generations").select("cost").eq("id", id).single();
    const { data: p } = await admin.from("profiles").select("credits").eq("id", auth.user.id).single();
    if (job && p) await admin.from("profiles").update({ credits: p.credits + job.cost }).eq("id", auth.user.id);
  }

  if (row.output_path) await supabase.storage.from("outputs").remove([row.output_path]);
  if (row.input_path) await supabase.storage.from("inputs").remove([row.input_path]);
  const { error } = await supabase.from("generations").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
