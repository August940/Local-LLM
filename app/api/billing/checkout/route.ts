import { NextResponse } from "next/server";
import { getPlan } from "@/lib/plans";
import { priceFor, stripe, stripeEnabled } from "@/lib/stripe";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const { plan: planId } = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = getPlan(planId);
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const admin = createAdminClient();

  if (stripeEnabled()) {
    const price = priceFor(plan.id);
    if (!price) return NextResponse.json({ error: `No Stripe price configured for ${plan.name}.` }, { status: 400 });
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", auth.user.id).single();
    let customer = profile?.stripe_customer_id as string | null;
    if (!customer) {
      const created = await stripe<{ id: string }>("customers", {
        email: auth.user.email ?? "",
        "metadata[user_id]": auth.user.id,
      });
      customer = created.id;
      await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", auth.user.id);
    }
    const session = await stripe<{ url: string }>("checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/subscription?success=1`,
      cancel_url: `${origin}/subscription?canceled=1`,
      client_reference_id: auth.user.id,
      "metadata[user_id]": auth.user.id,
      "metadata[plan]": plan.id,
      "subscription_data[metadata][user_id]": auth.user.id,
      "subscription_data[metadata][plan]": plan.id,
    });
    return NextResponse.json({ url: session.url });
  }

  if (process.env.ALLOW_DEMO_BILLING !== "true") {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  // Demo billing: switch plan instantly without payment (development only).
  await admin
    .from("profiles")
    .update({
      plan_id: plan.id,
      credits: plan.monthlyCredits,
      credits_reset_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    })
    .eq("id", auth.user.id);
  return NextResponse.json({ url: `/subscription?success=1&demo=1` });
}
