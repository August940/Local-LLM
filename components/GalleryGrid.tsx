"use client";

import { Download, Globe, Heart, Lock, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GenerationView } from "@/lib/generation/serialize";

type Props = {
  items: GenerationView[];
  owner?: boolean;
  onChange?: () => void;
  emptyTitle?: string;
  emptyText?: string;
};

export function Media({ item }: { item: Pick<GenerationView, "kind" | "output_url" | "prompt"> }) {
  if (!item.output_url) return null;
  return item.kind === "video" ? (
    <video src={item.output_url} muted loop playsInline autoPlay preload="metadata" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.output_url} alt={item.prompt} loading="lazy" />
  );
}

export function GalleryGrid({ items, owner = false, onChange, emptyTitle, emptyText }: Props) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, Partial<GenerationView>>>({});
  const [error, setError] = useState<string | null>(null);

  const view = items
    .map((i) => ({ ...i, ...state[i.id] }))
    .filter((i) => !(state[i.id] as { deleted?: boolean } | undefined)?.deleted);

  async function call(url: string, init: RequestInit) {
    setError(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return null;
    }
    return json;
  }

  async function toggleFavorite(id: string) {
    const json = await call("/api/favorites", { method: "POST", body: JSON.stringify({ generation_id: id }) });
    if (json) setState((s) => ({ ...s, [id]: { ...s[id], favorited: json.favorited } }));
  }

  async function togglePublic(item: GenerationView) {
    const json = await call(`/api/generations/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: !item.is_public }),
    });
    if (json) setState((s) => ({ ...s, [item.id]: { ...s[item.id], is_public: json.is_public } }));
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this creation? This cannot be undone.")) return;
    const json = await call(`/api/generations/${id}`, { method: "DELETE" });
    if (json) {
      setState((s) => ({ ...s, [id]: { ...s[id], deleted: true } as Partial<GenerationView> }));
      onChange?.();
    }
  }

  if (!view.length) {
    return (
      <div className="empty">
        <h3>{emptyTitle ?? "Nothing here yet"}</h3>
        <p>{emptyText ?? "Your designs will show up here."}</p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <div className="gallery">
        {view.map((item) => (
          <figure className="tile" key={item.id} style={{ margin: "0 0 16px" }}>
            <Media item={item} />
            {item.kind === "video" && <span className="tile-badge">VIDEO</span>}
            <figcaption className="tile-overlay">
              <p>{item.prompt}</p>
              <div className="tile-actions">
                <button
                  className={`btn btn-sm btn-icon ${item.favorited ? "active" : ""}`}
                  onClick={() => toggleFavorite(item.id)}
                  aria-label="Favourite"
                  title="Favourite"
                >
                  <Heart size={15} fill={item.favorited ? "currentColor" : "none"} />
                </button>
                <button
                  className="btn btn-sm btn-icon"
                  onClick={() => router.push(`/generator?prompt=${encodeURIComponent(item.prompt)}`)}
                  aria-label="Use this prompt"
                  title="Use this prompt"
                >
                  <Wand2 size={15} />
                </button>
                {item.output_url && (
                  <a
                    className="btn btn-sm btn-icon"
                    href={item.output_url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Download"
                    title="Download"
                  >
                    <Download size={15} />
                  </a>
                )}
                {owner && (
                  <>
                    <button
                      className={`btn btn-sm btn-icon ${item.is_public ? "active" : ""}`}
                      onClick={() => togglePublic(item)}
                      aria-label={item.is_public ? "Make private" : "Share on Explore"}
                      title={item.is_public ? "Shared on Explore" : "Private"}
                    >
                      {item.is_public ? <Globe size={15} /> : <Lock size={15} />}
                    </button>
                    <button
                      className="btn btn-sm btn-icon"
                      onClick={() => remove(item.id)}
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
