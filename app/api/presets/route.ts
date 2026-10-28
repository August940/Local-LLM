import { NextResponse } from "next/server";
import { checkPrompt } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  const name = (body.name ?? "").trim().slice(0, 60);
  const prompt = (body.prompt ?? "").trim();
  if (!name || prompt.length < 3) return NextResponse.json({ error: "Name and prompt are required." }, { status: 400 });
  const policy = checkPrompt(prompt, body.negative_prompt);
  if (!policy.ok) return NextResponse.json({ error: policy.message }, { status: 422 });
  const { data, error } = await supabase
    .from("style_presets")
    .insert({ user_id: auth.user.id, name, prompt, negative_prompt: body.negative_prompt || null, style: body.style || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ preset: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await supabase.from("style_presets").delete().eq("id", id).eq("user_id", auth.user.id);
  return NextResponse.json({ ok: true });
}
