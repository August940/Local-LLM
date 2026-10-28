"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm your dressmaker.ai stylist. Tell me what you're dreaming of: the occasion, a colour, a vibe. I'll help shape it into a design prompt.",
};

function extractPrompt(text: string) {
  const match = text.match(/PROMPT:\s*(.+)/i);
  return match?.[1]?.trim() ?? null;
}

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
    });
    const json = await res.json().catch(() => ({}));
    setMessages((m) => [...m, { role: "assistant", content: json.reply ?? json.error ?? "Sorry, something went wrong." }]);
    setLoading(false);
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => {
          const prompt = m.role === "assistant" ? extractPrompt(m.content) : null;
          return (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
              {prompt && (
                <div style={{ marginTop: 10 }}>
                  <Link href={`/generator?prompt=${encodeURIComponent(prompt)}`} className="btn btn-primary btn-sm">
                    Send to generator
                  </Link>
                </div>
              )}
            </div>
          );
        })}
        {loading && <div className="bubble assistant muted">Sketching ideas…</div>}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          className="input"
          placeholder="I need a dress for a summer wedding in Tuscany…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message"
        />
        <button className="btn btn-primary btn-icon" style={{ width: 46, height: 46 }} aria-label="Send" disabled={loading}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
