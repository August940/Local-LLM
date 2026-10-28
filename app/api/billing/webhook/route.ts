import { NextResponse } from "next/server";
import { getPlan } from "@/lib/plans";
import { verifyStripeSignature } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { object: any } };
  const admin = createAdminClient();
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = obj.metadata?.user_id ?? obj.client_reference_id;
      const plan = getPlan(obj.metadata?.plan);
      if (userId) {
        await admin
          .from("profiles")
          .update({
            plan_id: plan.id,
            credits: plan.monthlyCredits,
            credits_reset_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
            stripe_customer_id: obj.customer,
            stripe_subscription_id: obj.subscription,
          })
          .eq("id", userId);
      }
      break;
    }
    case "invoice.paid": {
      // Monthly renewal: refill credits for the current plan.
      const { data: profile } = await admin
        .from("profiles")
        .select("id, plan_id")
        .eq("stripe_customer_id", obj.customer)
        .maybeSingle();
      if (profile) {
        await admin
          .from("profiles")
          .update({
            credits: getPlan(profile.plan_id).monthlyCredits,
            credits_reset_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
          })
          .eq("id", profile.id);
      }
      break;
    }
    case "customer.subscription.deleted": {
      await admin
        .from("profiles")
        .update({ plan_id: "free", stripe_subscription_id: null })
        .eq("stripe_customer_id", obj.customer);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
