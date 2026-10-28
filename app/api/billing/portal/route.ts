import { NextResponse } from "next/server";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Manage or cancel the subscription (Stripe customer portal, or demo downgrade). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (stripeEnabled()) {
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", auth.user.id).single();
    if (!profile?.stripe_customer_id) return NextResponse.json({ error: "No subscription found." }, { status: 404 });
    const portal = await stripe<{ url: string }>("billing_portal/sessions", {
      customer: profile.stripe_customer_id,
      return_url: `${origin}/subscription`,
    });
    return NextResponse.json({ url: portal.url });
  }

  if (process.env.ALLOW_DEMO_BILLING !== "true") {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }
  await admin.from("profiles").update({ plan_id: "free" }).eq("id", auth.user.id);
  return NextResponse.json({ url: "/subscription?canceled=1&demo=1" });
}
