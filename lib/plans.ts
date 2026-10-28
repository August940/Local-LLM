export type Plan = {
  id: "free" | "creator" | "studio";
  name: string;
  priceEur: number;
  monthlyCredits: number;
  priority: number;
  allowVideo: boolean;
  features: string[];
};

/** Mirrors public.plans in the database (seeded by the migration). */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    monthlyCredits: 20,
    priority: 0,
    allowVideo: false,
    features: ["20 credits / month", "Image generation", "Standard queue", "Private gallery"],
  },
  {
    id: "creator",
    name: "Creator",
    priceEur: 9.99,
    monthlyCredits: 400,
    priority: 1,
    allowVideo: true,
    features: ["400 credits / month", "Image + video (beta)", "Priority queue", "Publish to Explore", "Saved style presets"],
  },
  {
    id: "studio",
    name: "Studio",
    priceEur: 29.99,
    monthlyCredits: 2000,
    priority: 2,
    allowVideo: true,
    features: ["2000 credits / month", "Highest queue priority", "Longer video clips", "Commercial use", "Early access to new models"],
  },
];

export const COST = { image: 1, video: 10 } as const;

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}
