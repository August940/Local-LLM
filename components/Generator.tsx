"use client";

import { Film, ImageIcon, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationView } from "@/lib/generation/serialize";
import { COST, type Plan } from "@/lib/plans";
import { checkPrompt } from "@/lib/policy";
import { createClient } from "@/lib/supabase/client";
import { GalleryGrid, Media } from "./GalleryGrid";

type Preset = { id: string; name: string; prompt: string; negative_prompt: string | null; style: string | null };

const STYLES = [
  { id: "editorial", label: "Editorial" },
  { id: "runway", label: "Runway" },
  { id: "sketch", label: "Design sketch" },
  { id: "streetwear", label: "Streetwear" },
  { id: "bridal", label: "Bridal" },
  { id: "flatlay", label: "Flat lay" },
];

const ASPECTS = ["3:4", "4:5", "1:1", "9:16", "16:9"];

const EXAMPLES = [
  "Emerald silk slip dress with draped cowl neckline, gold accessories, evening garden party",
  "Oversized cream wool coat over a pleated midi skirt, Copenhagen street style, autumn",
  "Structured black tuxedo jumpsuit with satin lapels, minimalist studio backdrop",
  "Pastel pink tulle ball gown with puff sleeves, fairytale ballroom, soft light",
];

const MAX_UPLOAD = 10 * 1024 * 1024;

export function Generator({
  userId,
  plan,
  credits: initialCredits,
  initialPrompt,
  presets,
}: {
  userId: string | null;
  plan: Plan;
  credits: number;
  initialPrompt: string;
  presets: Preset[];
}) {
  const [kind, setKind] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [negative, setNegative] = useState("");
  const [style, setStyle] = useState<string | null>("editorial");
  const [aspect, setAspect] = useState("3:4");
  const [isPublic, setIsPublic] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GenerationView[]>([]);
  const [credits, setCredits] = useState(initialCredits);
  const [presetName, setPresetName] = useState("");
  const [presetList, setPresetList] = useState(presets);
  const inputRef = useRef<HTMLInputElement>(null);

  const cost = COST[kind];
  const active = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const finished = jobs.filter((j) => j.status === "completed");
  const failed = jobs.filter((j) => j.status === "failed").slice(0, 3);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const res = await fetch("/api/generations?limit=40", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setJobs(json.generations);
    if (typeof json.credits === "number") setCredits(json.credits);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll quickly while jobs are in the queue; realtime pushes updates as well.
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(refresh, active.length ? 3000 : 20000);
    return () => window.clearInterval(id);
  }, [userId, active.length, refresh]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`generations-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "generations", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setError("Upload a PNG, JPG or WebP image.");
      return;
    }
    if (f.size > MAX_UPLOAD) {
      setError("The image must be under 10 MB.");
      return;
    }
    setFile(f);
  }

  async function uploadReference(): Promise<string | null> {
    if (!file || !userId) return null;
    const supabase = createClient();
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("inputs").upload(path, file, { contentType: file.type });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    return path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError("Supabase is not configured yet, so jobs cannot be queued.");
      return;
    }
    const policy = checkPrompt(prompt, negative);
    if (!policy.ok) {
      setError(policy.message);
      return;
    }
    if (credits < cost) {
      setError("You are out of credits. Upgrade your plan to keep designing.");
      return;
    }
    setSubmitting(true);
    try {
      const input_path = await uploadReference();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, negative_prompt: negative, kind, style, aspect_ratio: aspect, input_path, is_public: isPublic }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not queue the job.");
      setCredits((c) => c - cost);
      setJobs((j) => [{ ...json.job, output_url: null, input_url: preview, queue_position: undefined }, ...j]);
      setFile(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/generations/${id}`, { method: "DELETE" });
    refresh();
  }

  async function savePreset() {
    if (!presetName.trim() || prompt.trim().length < 3) return;
    const res = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: presetName, prompt, negative_prompt: negative, style }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return;
    }
    setPresetList((p) => [json.preset, ...p]);
    setPresetName("");
  }

  function applyPreset(p: Preset) {
    setPrompt(p.prompt);
    setNegative(p.negative_prompt ?? "");
    setStyle(p.style);
  }

  return (
    <div className="page">
      <header className="title-row">
        <div>
          <h1>
            Generator
          </h1>
          <p>Describe a look, add a reference photo, and send it to the queue.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="num muted" style={{ fontSize: 14 }}>
            {credits} credits left · {plan.name} plan
          </span>
          {plan.id === "free" && (
            <Link href="/subscription" className="btn btn-ghost btn-sm">
              Upgrade
            </Link>
          )}
        </div>
      </header>

      {!userId && (
        <div className="notice">
          Demo mode: Supabase is not configured, so the form works but nothing is queued. Add your keys to
          .env.local to enable login, storage and the queue.
        </div>
      )}

      <div className="generator">
        <form className="panel" onSubmit={submit}>
          <div className="row between" style={{ marginBottom: 18 }}>
            <div className="seg" role="group" aria-label="Output type">
              <button type="button" aria-pressed={kind === "image"} onClick={() => setKind("image")}>
                <ImageIcon size={15} /> Image
              </button>
              <button
                type="button"
                aria-pressed={kind === "video"}
                onClick={() => setKind("video")}
                title={plan.allowVideo ? "" : "Video is part of Creator and Studio"}
              >
                <Film size={15} /> Video
              </button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              {cost} credit{cost > 1 ? "s" : ""}
            </span>
          </div>

          {kind === "video" && !plan.allowVideo && (
            <div className="notice">
              Video (Wan 2.2) is included in Creator and Studio. <Link href="/subscription">See plans</Link>
            </div>
          )}

          <div className="field">
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              className="textarea"
              placeholder="A flowing lavender chiffon gown with a corset bodice and long train…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              required
            />
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} className="chip" onClick={() => setPrompt(ex)} title={ex}>
                  {ex.split(",")[0].slice(0, 28)}…
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Reference image (optional)</span>
            <div
              className="dropzone"
              data-drag={drag}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            >
              {preview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Reference preview" />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon remove"
                    style={{ background: "#fff" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    aria-label="Remove image"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <div>
                  <Upload size={20} strokeWidth={1.6} style={{ display: "block", margin: "0 auto 8px" }} />
                  <strong style={{ fontWeight: 500 }}>Drop an image or click to upload</strong>
                  <div className="hint" style={{ marginTop: 4 }}>
                    A sketch, fabric swatch or outfit photo · PNG, JPG, WebP up to 10 MB
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="field">
            <span className="label">Style</span>
            <div className="chips">
              {STYLES.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="chip"
                  aria-pressed={style === s.id}
                  onClick={() => setStyle(style === s.id ? null : s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Aspect ratio</span>
            <div className="chips">
              {ASPECTS.map((a) => (
                <button type="button" key={a} className="chip" aria-pressed={aspect === a} onClick={() => setAspect(a)}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <details style={{ marginBottom: 18 }}>
            <summary style={{ cursor: "pointer", fontWeight: 500, marginBottom: 12 }}>Advanced</summary>
            <div className="field">
              <label htmlFor="negative">Avoid (negative prompt)</label>
              <input
                id="negative"
                className="input"
                placeholder="blurry, extra fingers, wrinkled fabric"
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
              />
            </div>
            <div className="field">
              <span className="label">Style presets</span>
              {presetList.length > 0 && (
                <div className="chips" style={{ marginBottom: 8 }}>
                  {presetList.map((p) => (
                    <button type="button" key={p.id} className="chip" onClick={() => applyPreset(p)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="row">
                <input
                  className="input"
                  placeholder="Save current prompt as…"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={savePreset} disabled={!userId}>
                  Save
                </button>
              </div>
            </div>
            <label className="row" style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={plan.id === "free"}
              />
              Share the result on Explore {plan.id === "free" && <span className="muted">(Creator plan)</span>}
            </label>
          </details>

          {error && <div className="notice error">{error}</div>}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            disabled={submitting || prompt.trim().length < 3 || (kind === "video" && !plan.allowVideo)}
          >
            {submitting && <LoaderCircle size={18} className="spin" />}
            {submitting ? "Adding to queue…" : `Generate ${kind}`}
          </button>
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            By generating you agree to the <Link href="/policy">content policy</Link>. No nudity, minors or real people.
          </p>
        </form>

        <section>
          <div className="section-title">
            <h2>Queue</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {active.length ? `${active.length} in progress` : "Idle"}
            </span>
          </div>
          {active.length === 0 && failed.length === 0 ? (
            <div className="empty" style={{ marginBottom: 28 }}>
              <p>Nothing in the queue. Your next design starts here.</p>
            </div>
          ) : (
            <div className="queue-list" style={{ marginBottom: 28 }}>
              {[...active, ...failed].map((job) => (
                <div className="queue-item" key={job.id}>
                  <div className="queue-thumb">
                    {job.input_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.input_url} alt="" />
                    ) : job.kind === "video" ? (
                      <Film size={20} />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                  </div>
                  <div className="queue-body">
                    <p title={job.prompt}>{job.prompt}</p>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`status ${job.status}`}>
                        {job.status === "processing" && <LoaderCircle size={12} className="spin" />}
                        {job.status === "queued"
                          ? job.queue_position
                            ? `Queued · #${job.queue_position}`
                            : "Queued"
                          : job.status === "processing"
                            ? "Generating"
                            : "Failed"}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {job.kind}
                      </span>
                    </div>
                    {job.status === "failed" && job.error && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {job.error} · credits refunded
                      </div>
                    )}
                    {job.status === "processing" && (
                      <div className="progress">
                        <span />
                      </div>
                    )}
                  </div>
                  {job.status !== "processing" && (
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => cancel(job.id)}
                      aria-label={job.status === "queued" ? "Cancel" : "Remove"}
                      title={job.status === "queued" ? "Cancel and refund" : "Remove"}
                    >
                      {job.status === "queued" ? <X size={16} /> : <Trash2 size={16} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="section-title">
            <h2>Latest results</h2>
            <Link href="/my-ai" className="muted" style={{ fontSize: 14 }}>
              View all →
            </Link>
          </div>
          {finished[0] && (
            <div className="tile" style={{ marginBottom: 16, maxWidth: 420 }}>
              <Media item={finished[0]} />
            </div>
          )}
          <GalleryGrid
            items={finished.slice(1, 13)}
            owner
            onChange={refresh}
            emptyTitle={finished.length ? "More results will appear here" : "No designs yet"}
            emptyText="Finished designs are saved to your gallery automatically."
          />
        </section>
      </div>
    </div>
  );
}
