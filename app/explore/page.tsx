import { GalleryGrid } from "@/components/GalleryGrid";
import { getPublicCreations } from "@/lib/explore";

export const metadata = { title: "Explore · dressmaker.ai" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const creations = await getPublicCreations(60).catch(() => []);
  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <span className="gradient-text">Explore</span> the atelier
        </h1>
        <p>Designs the community chose to share. Tap the wand to remix any prompt.</p>
      </header>
      <GalleryGrid
        items={creations}
        emptyTitle="Nothing shared yet"
        emptyText="When creators publish their designs they appear here."
      />
    </div>
  );
}
