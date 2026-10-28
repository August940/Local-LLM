"use client";

import { Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Preset = { id: string; name: string; prompt: string; style: string | null };

export function PresetList({ presets }: { presets: Preset[] }) {
  const [list, setList] = useState(presets);

  async function remove(id: string) {
    await fetch(`/api/presets?id=${id}`, { method: "DELETE" });
    setList((l) => l.filter((p) => p.id !== id));
  }

  if (!list.length) {
    return (
      <div className="empty">
        <Wand2 size={28} />
        <h3>No presets yet</h3>
        <p>Save a prompt from the Generator&apos;s Advanced section to reuse your signature style.</p>
      </div>
    );
  }

  return (
    <div className="queue-list">
      {list.map((p) => (
        <div key={p.id} className="queue-item">
          <div className="queue-body">
            <strong>{p.name}</strong>
            <p className="muted" title={p.prompt}>
              {p.prompt}
            </p>
            {p.style && <span className="status">{p.style}</span>}
          </div>
          <Link href={`/generator?prompt=${encodeURIComponent(p.prompt)}`} className="btn btn-ghost btn-sm">
            Use
          </Link>
          <button className="btn btn-ghost btn-icon" onClick={() => remove(p.id)} aria-label="Delete preset">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
