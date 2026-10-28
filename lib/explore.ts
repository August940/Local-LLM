import "server-only";
import { isSupabaseConfigured } from "@/lib/env";
import { withSignedUrls, type GenerationRow, type GenerationView } from "@/lib/generation/serialize";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Public, finished creations for Explore (newest first). */
export async function getPublicCreations(limit = 48): Promise<GenerationView[]> {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("generations")
    .select("*")
    .eq("is_public", true)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = await withSignedUrls(admin, (data ?? []) as GenerationRow[]);

  // Mark the viewer's favourites
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user && rows.length) {
    const { data: favs } = await supabase
      .from("favorites")
      .select("generation_id")
      .in(
        "generation_id",
        rows.map((r) => r.id),
      );
    const set = new Set((favs ?? []).map((f) => f.generation_id));
    return rows.map((r) => ({ ...r, favorited: set.has(r.id) }));
  }
  return rows;
}
