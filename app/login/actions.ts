"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/generator";
}

async function origin() {
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "Supabase is not configured yet. Add the keys to .env.local." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured) return { error: "Supabase is not configured yet. Add the keys to .env.local." };
  if (form.get("policy") !== "on") return { error: "Please accept the content policy to create an account." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    options: {
      data: { full_name: String(form.get("name") ?? "") },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your inbox to confirm your email, then log in." };
  redirect(safeNext(form.get("next")));
}

export async function signInWithGoogle(form: FormData) {
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "OAuth failed")}`);
  redirect(data.url);
}
