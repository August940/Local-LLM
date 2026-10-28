import { NextResponse } from "next/server";
import { checkPrompt } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";

const SYSTEM = `You are the dressmaker.ai stylist: a friendly fashion designer who helps users
turn ideas into great image prompts for outfits. Ask about occasion, silhouette, fabric, colour
and mood. When you have enough, reply with a ready prompt on its own line starting with "PROMPT:".
Keep everything non-sexual and only describe adult, fully clothed models.`;

type Msg = { role: "user" | "assistant"; content: string };

function fallbackReply(last: string) {
  const idea = last.trim().replace(/[.?!]+$/, "");
  return (
    `Love it. Here is a starting point you can send straight to the generator:\n\n` +
    `PROMPT: ${idea}, tailored silhouette, luxurious fabric with subtle texture, soft studio lighting, ` +
    `full-length fashion editorial photo, adult model, clean background\n\n` +
    `Tell me the occasion and your favourite colours and I will refine it.`
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in to chat." }, { status: 401 });

  const { messages } = (await request.json().catch(() => ({ messages: [] }))) as { messages: Msg[] };
  const history = (messages ?? []).slice(-16).filter((m) => m && typeof m.content === "string");
  const last = history.filter((m) => m.role === "user").pop()?.content ?? "";
  const policy = checkPrompt(last);
  if (!policy.ok) return NextResponse.json({ reply: policy.message });

  const api = process.env.CHAT_API_URL;
  if (!api) return NextResponse.json({ reply: fallbackReply(last) });

  const res = await fetch(`${api.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CHAT_API_KEY ? { Authorization: `Bearer ${process.env.CHAT_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.CHAT_MODEL ?? "llama3.1",
      messages: [{ role: "system", content: SYSTEM }, ...history],
      temperature: 0.8,
    }),
  }).catch(() => null);

  if (!res?.ok) return NextResponse.json({ reply: fallbackReply(last) });
  const json = await res.json();
  return NextResponse.json({ reply: json.choices?.[0]?.message?.content ?? fallbackReply(last) });
}
