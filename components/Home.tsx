"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import type { GenerationView } from "@/lib/generation/serialize";
import { GalleryGrid } from "./GalleryGrid";
import { Logo } from "./Logo";

/* The home page is a split stage: the left half never moves and shows the
   garment the visitor is composing; the right half is the reading column. */

type Look = {
  id: string;
  name: string;
  prompt: string;
  fabric: string; // the garment's fill
  trim: string;
  caption: string;
  silhouette: "gown" | "slip" | "coat" | "suit";
};

const LOOKS: Look[] = [
  {
    id: "editorial",
    name: "Editorial gown",
    prompt: "Sculptural red satin gown with an asymmetric neckline, studio light, full length",
    fabric: "#c8102e",
    trim: "#8a0a1f",
    caption: "Editorial · 3:4 · 1 credit",
    silhouette: "gown",
  },
  {
    id: "slip",
    name: "Silk slip dress",
    prompt: "Emerald silk slip dress with a draped cowl neckline and thin straps, evening garden party",
    fabric: "#1f6f4a",
    trim: "#124530",
    caption: "Runway · 4:5 · 1 credit",
    silhouette: "slip",
  },
  {
    id: "coat",
    name: "Oversized wool coat",
    prompt: "Oversized cream wool coat with dropped shoulders over a pleated midi skirt, Copenhagen street style",
    fabric: "#e9e2d3",
    trim: "#b8ad96",
    caption: "Streetwear · 3:4 · 1 credit",
    silhouette: "coat",
  },
  {
    id: "suit",
    name: "Tuxedo jumpsuit",
    prompt: "Structured black tuxedo jumpsuit with satin lapels and a wide leg, minimalist backdrop",
    fabric: "#1c1c22",
    trim: "#3a3a44",
    caption: "Design sketch · 9:16 · 1 credit",
    silhouette: "suit",
  },
];

const STAGES = [
  { name: "Describe", clause: "Write the look in a sentence." },
  { name: "Reference", clause: "Add a sketch or a swatch, if you have one." },
  { name: "Queue", clause: "The job runs on a cloud GPU, in order." },
  { name: "Gallery", clause: "The result lands in your private gallery." },
];

function Garment({ look }: { look: Look }) {
  const { fabric, trim, silhouette } = look;
  // One flat graphic language: a figure drawn in the garment's own colour on the black stage.
  const paths: Record<Look["silhouette"], ReactElement> = {
    gown: (
      <>
        <path d="M118 108 L202 108 L212 190 L236 420 L84 420 L108 190 Z" fill={fabric} />
        <path d="M118 108 L160 150 L202 108 Z" fill={trim} />
        <path d="M84 420 L236 420 L246 440 L74 440 Z" fill={trim} />
      </>
    ),
    slip: (
      <>
        <path d="M132 112 L188 112 L194 180 L206 400 L114 400 L126 180 Z" fill={fabric} />
        <path d="M132 112 Q160 140 188 112 L186 128 Q160 150 134 128 Z" fill={trim} />
        <path d="M142 104 L138 76 M178 104 L182 76" stroke={fabric} strokeWidth="3" />
      </>
    ),
    coat: (
      <>
        <path d="M108 110 L212 110 L228 300 L92 300 Z" fill={fabric} />
        <path d="M160 110 L140 300 M160 110 L180 300" stroke={trim} strokeWidth="3" />
        <path d="M110 110 L92 230 L80 230 L96 108 Z M210 110 L228 230 L240 230 L224 108 Z" fill={fabric} />
        <path d="M118 300 L202 300 L214 400 L106 400 Z" fill={trim} />
      </>
    ),
    suit: (
      <>
        <path d="M118 108 L202 108 L210 250 L196 420 L166 420 L160 300 L154 420 L124 420 L110 250 Z" fill={fabric} />
        <path d="M138 108 L160 170 L182 108 L172 108 L160 140 L148 108 Z" fill={trim} />
        <path d="M110 108 L96 220 L84 218 L102 106 Z M210 108 L224 220 L236 218 L218 106 Z" fill={fabric} />
      </>
    ),
  };
  return (
    <svg viewBox="0 100 320 350" role="img" aria-label={`${look.name} drawn as a flat silhouette`}>
      {paths[silhouette]}
    </svg>
  );
}

function Fragment({ stage, look }: { stage: number; look: Look }) {
  if (stage === 0) {
    return (
      <div className="stage-fragment" data-ui>
        <div className="label" style={{ marginBottom: 6 }}>
          Prompt
        </div>
        <div className="textarea" style={{ minHeight: 0, padding: "10px 12px", background: "var(--surface)", border: 0 }}>
          {look.prompt}
        </div>
      </div>
    );
  }
  if (stage === 1) {
    return (
      <div className="stage-fragment" data-ui>
        <div className="label" style={{ marginBottom: 6 }}>
          Reference image
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ width: 56, height: 70, borderRadius: 8, background: look.fabric, flex: "none" }} />
          <span className="muted" style={{ fontSize: 13 }}>
            swatch.jpg · 1.2 MB
            <br />
            Used as the fabric for the look.
          </span>
        </div>
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div className="stage-fragment" data-ui>
        <div className="queue-item" style={{ padding: 0, border: 0 }}>
          <span className="queue-thumb" style={{ background: look.fabric }} />
          <div className="queue-body">
            <p>{look.prompt}</p>
            <span className="status processing">Generating</span>
            <div className="progress">
              <span />
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function Home({ creations }: { creations: GenerationView[] }) {
  const [lookId, setLookId] = useState(LOOKS[0].id);
  const [stage, setStage] = useState(0);
  const [prompt, setPrompt] = useState(LOOKS[0].prompt);
  const look = LOOKS.find((l) => l.id === lookId) ?? LOOKS[0];

  function pick(id: string) {
    setLookId(id);
    const l = LOOKS.find((x) => x.id === id);
    if (l) setPrompt(l.prompt);
  }

  return (
    <>
      <div className="home">
        <div className="stage-col">
          <div className="stage" aria-live="polite">
            {stage === 3 || stage === 0 ? <Garment look={look} /> : <Fragment stage={stage} look={look} />}
            <div className="stage-caption">
              <strong>{stage === 3 ? "Saved to My AI" : look.name}</strong>
              <span>{look.caption}</span>
            </div>
            <h1 className="home-name">dressmaker</h1>
          </div>
        </div>

        <div className="read-col">
          <section className="home-first">
            <div>
              <p className="home-lead">
                Describe an outfit, or start from a sketch, and dressmaker.ai designs it: fashion images now, short
                runway clips on the paid plans.
              </p>
              <form action="/generator" className="home-prompt">
                <input
                  name="prompt"
                  className="input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  aria-label="Describe the outfit"
                />
                <button className="btn btn-primary btn-lg">Design it</button>
              </form>
              <div className="style-index" role="group" aria-label="Pick a look to preview">
                {LOOKS.map((l) => (
                  <button key={l.id} type="button" aria-pressed={l.id === lookId} onClick={() => pick(l.id)}>
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

          </section>

          <section aria-labelledby="how">
            <h2 id="how">From a sentence to a saved design in four steps</h2>
            <div className="stages">
              <p className="stage-clause" aria-live="polite">
                {STAGES[stage].clause}
              </p>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={stage}
                onChange={(e) => setStage(Number(e.target.value))}
                aria-label="Step"
              />
              <div className="stage-names">
                {STAGES.map((s, i) => (
                  <span key={s.name} aria-current={i === stage ? "true" : undefined}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
            <p style={{ marginTop: 28 }}>
              Jobs run in order of plan priority. You see your place in the queue, and a failed job gives its
              credit back. Everything you make stays private unless you share it on Explore.
            </p>
          </section>

          <section aria-labelledby="plans">
            <h2 id="plans">Two ways to start</h2>
            <div className="plan-fields">
              <div className="plan-field creator">
                <h3>Creator</h3>
                <p style={{ color: "#c9c9d3" }}>
                  For designers who work every day: 400 credits a month, image and video, priority in the queue,
                  publishing to Explore and saved style presets.
                </p>
                <div className="price-big num">
                  <span>
                    €9.99<small> a month</small>
                  </span>
                  <Link href="/subscription" className="btn btn-primary">
                    Get Creator
                  </Link>
                </div>
              </div>
              <div className="plan-field free">
                <h3>Free</h3>
                <p>Twenty credits a month, image generation and a private gallery. No card needed.</p>
                <div className="price-big num">
                  <span>
                    €0<small> a month</small>
                  </span>
                  <Link href="/login?mode=signup" className="btn btn-ghost">
                    Create an account
                  </Link>
                </div>
              </div>
            </div>
            <p style={{ marginTop: 20 }}>
              Studio, at €29.99 a month, adds 2000 credits, the highest queue priority and commercial use.{" "}
              <Link href="/subscription" style={{ textDecoration: "underline", textUnderlineOffset: "0.18em" }}>
                Compare the plans
              </Link>
              .
            </p>
          </section>

          {creations.length > 0 && (
            <section className="community" aria-labelledby="community">
              <h2 id="community">Shared by the community</h2>
              <GalleryGrid items={creations} />
            </section>
          )}

          <section className="home-close" aria-labelledby="close">
            <h2 id="close">Your next collection starts with a sentence</h2>
            <p>Fashion only: no nudity, no minors, no real people. Every prompt is checked before it runs.</p>
            <div className="row" style={{ marginTop: 28, gap: 10, flexWrap: "wrap" }}>
              <Link href="/generator" className="btn btn-primary btn-lg">
                Open the generator
              </Link>
              <Link href="/policy" className="btn btn-text" style={{ color: "#c9c9d3" }}>
                Read the content policy
              </Link>
            </div>
          </section>

          <footer className="home-footer">
            <Logo />
            <nav className="menu" aria-label="Footer">
              <Link href="/generator">Generator</Link>
              <Link href="/explore">Explore</Link>
              <Link href="/chat">Chat with a stylist</Link>
              <Link href="/subscription">Subscription</Link>
              <Link href="/my-ai">My AI</Link>
            </nav>
            <div className="legal">
              <span>© {new Date().getFullYear()} dressmaker.ai</span>
              <Link href="/policy">Content policy</Link>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
