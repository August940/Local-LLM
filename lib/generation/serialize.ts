import type { SupabaseClient } from "@supabase/supabase-js";

export type GenerationRow = {
  id: string;
  user_id: string;
  kind: "image" | "video";
  prompt: string;
  negative_prompt: string | null;
  style: string | null;
  aspect_ratio: string;
  input_path: string | null;
  output_path: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  error: string | null;
  is_public: boolean;
  likes: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type GenerationView = GenerationRow & {
  output_url: string | null;
  input_url: string | null;
  queue_position?: number;
  favorited?: boolean;
};

/** Attach short-lived signed URLs for outputs (and inputs) to rows. */
export async function withSignedUrls(
  client: SupabaseClient,
  rows: GenerationRow[],
  opts: { inputs?: boolean } = {},
): Promise<GenerationView[]> {
  const outputPaths = rows.map((r) => r.output_path).filter((p): p is string => Boolean(p));
  const inputPaths = opts.inputs ? rows.map((r) => r.input_path).filter((p): p is string => Boolean(p)) : [];
  const [outs, ins] = await Promise.all([
    outputPaths.length ? client.storage.from("outputs").createSignedUrls(outputPaths, 3600) : { data: [] },
    inputPaths.length ? client.storage.from("inputs").createSignedUrls(inputPaths, 3600) : { data: [] },
  ]);
  const outMap = new Map((outs.data ?? []).map((s) => [s.path, s.signedUrl]));
  const inMap = new Map((ins.data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    ...r,
    output_url: r.output_path ? (outMap.get(r.output_path) ?? null) : null,
    input_url: r.input_path ? (inMap.get(r.input_path) ?? null) : null,
  }));
}
