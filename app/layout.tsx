import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, type SidebarUser } from "@/components/Sidebar";
import { getPlan } from "@/lib/plans";
import { getProfile } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "dressmaker.ai — AI fashion design studio",
  description: "Describe a look or upload a reference and let AI design the outfit. Images and short fashion videos.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const profile = await getProfile().catch(() => null);
  const user: SidebarUser = profile
    ? { name: profile.display_name ?? "You", plan: getPlan(profile.plan_id).name, credits: profile.credits }
    : null;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=STIX+Two+Text:ital,wght@0,400;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
