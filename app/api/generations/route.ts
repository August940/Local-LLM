import { NextResponse } from "next/server";
import { withSignedUrls, type GenerationRow } from "@/lib/generation/serialize";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's generations, newest first, with queue positions. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 40));
  const active = url.searchParams.get("active") === "1";

  let query = supabase
    .from("generations")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (active) query = query.in("status", ["queued", "processing"]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await withSignedUrls(supabase, (data ?? []) as GenerationRow[], { inputs: true });
  const queued = rows.filter((r) => r.status === "queued");
  const positions = await Promise.all(
    queued.map((r) => supabase.rpc("queue_position", { job_id: r.id }).then((res) => [r.id, res.data as number] as const)),
  );
  const posMap = new Map(positions);
  const { data: profile } = await supabase.from("profiles").select("credits").eq("id", auth.user.id).single();

  return NextResponse.json({
    generations: rows.map((r) => ({ ...r, queue_position: posMap.get(r.id) })),
    credits: profile?.credits ?? null,
  });
}
