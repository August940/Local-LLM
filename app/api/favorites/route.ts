import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Toggle a favourite on any creation the user can see. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in to save favourites." }, { status: 401 });

  const { generation_id } = (await request.json().catch(() => ({}))) as { generation_id?: string };
  if (!generation_id) return NextResponse.json({ error: "Missing generation_id" }, { status: 400 });

  const { data: existing } = await supabase
    .from("favorites")
    .select("generation_id")
    .eq("user_id", auth.user.id)
    .eq("generation_id", generation_id)
    .maybeSingle();

  if (existing) {
    await supabase.from("favorites").delete().eq("user_id", auth.user.id).eq("generation_id", generation_id);
    return NextResponse.json({ favorited: false });
  }
  const { error } = await supabase.from("favorites").insert({ user_id: auth.user.id, generation_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ favorited: true });
}
