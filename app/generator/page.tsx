import { redirect } from "next/navigation";
import { Generator } from "@/components/Generator";
import { isSupabaseConfigured } from "@/lib/env";
import { getPlan } from "@/lib/plans";
import { createClient, getProfile } from "@/lib/supabase/server";

export const metadata = { title: "Generator · dressmaker.ai" };

export default async function GeneratorPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt } = await searchParams;
  if (!isSupabaseConfigured) {
    return <Generator userId={null} plan={getPlan("free")} credits={0} initialPrompt={prompt ?? ""} presets={[]} />;
  }
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/generator");
  const supabase = await createClient();
  const { data: presets } = await supabase
    .from("style_presets")
    .select("id, name, prompt, negative_prompt, style")
    .order("created_at", { ascending: false });

  return (
    <Generator
      userId={profile.id}
      plan={getPlan(profile.plan_id)}
      credits={profile.credits}
      initialPrompt={prompt ?? ""}
      presets={presets ?? []}
    />
  );
}
