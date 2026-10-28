import Link from "next/link";
import { redirect } from "next/navigation";
import { GalleryGrid } from "@/components/GalleryGrid";
import { PresetList } from "@/components/PresetList";
import { isSupabaseConfigured } from "@/lib/env";
import { withSignedUrls, type GenerationRow } from "@/lib/generation/serialize";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = { title: "My AI · dressmaker.ai" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "creations", label: "Creations" },
  { id: "favorites", label: "Favourites" },
  { id: "presets", label: "Style presets" },
];

export default async function MyAiPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "creations" } = await searchParams;
  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <div className="notice">Connect Supabase to see your saved creations.</div>
      </div>
    );
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/my-ai");

  let content: React.ReactNode;
  if (tab === "presets") {
    const { data } = await supabase
      .from("style_presets")
      .select("id, name, prompt, style, created_at")
      .order("created_at", { ascending: false });
    content = <PresetList presets={data ?? []} />;
  } else if (tab === "favorites") {
    const { data: favs } = await supabase
      .from("favorites")
      .select("generation_id")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });
    const ids = (favs ?? []).map((f) => f.generation_id);
    let rows: GenerationRow[] = [];
    if (ids.length) {
      const { data } = await supabase.from("generations").select("*").in("id", ids);
      rows = (data ?? []) as GenerationRow[];
    }
    // Favourites can belong to other users, so sign with the service role.
    const signer = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
    const items = (await withSignedUrls(signer, rows)).map((r) => ({ ...r, favorited: true }));
    content = (
      <GalleryGrid
        items={items}
        owner={false}
        emptyTitle="No favourites yet"
        emptyText="Tap the heart on any design in Explore or your gallery."
      />
    );
  } else {
    const [{ data }, { data: favs }] = await Promise.all([
      supabase
        .from("generations")
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(120),
      supabase.from("favorites").select("generation_id").eq("user_id", auth.user.id),
    ]);
    const favSet = new Set((favs ?? []).map((f) => f.generation_id));
    const items = (await withSignedUrls(supabase, (data ?? []) as GenerationRow[])).map((r) => ({
      ...r,
      favorited: favSet.has(r.id),
    }));
    content = (
      <GalleryGrid
        items={items}
        owner
        emptyTitle="Your gallery is empty"
        emptyText="Head to the Generator to create your first design."
      />
    );
  }

  return (
    <div className="page">
      <header className="title-row">
        <div>
          <h1>
            My AI
          </h1>
          <p>Everything you have designed, saved and loved, stored safely in your account.</p>
        </div>
        <Link href="/generator" className="btn btn-primary">
          New design
        </Link>
      </header>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={`/my-ai?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
