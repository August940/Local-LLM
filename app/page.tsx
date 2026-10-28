export const dynamic = "force-dynamic";

import { ArrowRight, Film, ImagePlus, Layers, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { GalleryGrid } from "@/components/GalleryGrid";
import { getPublicCreations } from "@/lib/explore";

export default async function Home() {
  const creations = await getPublicCreations(12).catch(() => []);

  return (
    <div className="page">
      <section className="hero">
        <span className="pill" style={{ marginBottom: 18 }}>
          New · Wan 2.2 fashion video
        </span>
        <h1>
          Design the outfit.
          <br />
          <span className="gradient-text">We&apos;ll sew the pixels.</span>
        </h1>
        <p>
          dressmaker.ai turns a sentence, a sketch or a fabric photo into fashion images and short runway clips.
        </p>
        <form action="/generator" className="hero-prompt">
          <input name="prompt" placeholder="A sculptural red satin gown with an asymmetric neckline…" aria-label="Prompt" />
          <button className="btn btn-primary">
            <Sparkles size={18} /> Generate
          </button>
        </form>
      </section>

      <section className="features">
        <div className="feature">
          <div className="icon">
            <Wand2 size={22} />
          </div>
          <h3>Prompt to look</h3>
          <p>Describe silhouette, fabric and mood. Pick a style like editorial, runway or design sketch.</p>
        </div>
        <div className="feature">
          <div className="icon">
            <ImagePlus size={22} />
          </div>
          <h3>Start from a reference</h3>
          <p>Upload a sketch, swatch or outfit photo and let the model restyle it into something new.</p>
        </div>
        <div className="feature">
          <div className="icon">
            <Film size={22} />
          </div>
          <h3>Bring it to life</h3>
          <p>Turn a design into a short catwalk video on the Creator and Studio plans.</p>
        </div>
        <div className="feature">
          <div className="icon">
            <Layers size={22} />
          </div>
          <h3>Smart queue</h3>
          <p>Jobs run on cloud GPUs in order of plan priority. Watch progress live and keep working.</p>
        </div>
        <div className="feature">
          <div className="icon">
            <Sparkles size={22} />
          </div>
          <h3>Your private gallery</h3>
          <p>Every result is stored in your account. Favourite, download or share to Explore.</p>
        </div>
        <div className="feature">
          <div className="icon">
            <ShieldCheck size={22} />
          </div>
          <h3>Safe by design</h3>
          <p>
            Fashion only. No nudity, no minors, no real people. Read the <Link href="/policy">content policy</Link>.
          </p>
        </div>
      </section>

      <div className="section-title">
        <h2>Fresh from the community</h2>
        <Link href="/explore" className="row muted" style={{ gap: 6, fontSize: 14 }}>
          Explore all <ArrowRight size={16} />
        </Link>
      </div>
      <GalleryGrid
        items={creations}
        emptyTitle="Be the first to share"
        emptyText="Creations shared by the community will show up here."
      />
    </div>
  );
}
