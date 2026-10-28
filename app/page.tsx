import { Home } from "@/components/Home";
import { getPublicCreations } from "@/lib/explore";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const creations = await getPublicCreations(12).catch(() => []);
  return <Home creations={creations} />;
}
