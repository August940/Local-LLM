import { PlanButton } from "@/components/PlanButton";
import { Check } from "lucide-react";
import { PLANS, getPlan } from "@/lib/plans";
import { getProfile } from "@/lib/supabase/server";

export const metadata = { title: "Subscription · dressmaker.ai" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string; demo?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getProfile().catch(() => null);
  const current = profile ? getPlan(profile.plan_id) : null;
  const demo = !process.env.STRIPE_SECRET_KEY;

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          Pick your <span className="gradient-text">plan</span>
        </h1>
        <p>Credits refill every month. 1 credit per image, 10 per video clip. Cancel anytime.</p>
      </header>

      {sp.success && (
        <div className="notice">
          Your plan is active{sp.demo ? " (demo billing, no payment taken)" : ""}. Happy designing!
        </div>
      )}
      {sp.canceled && <div className="notice">No changes were made to your subscription.</div>}
      {profile && current && (
        <div className="card row between" style={{ marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="label">Current plan</div>
            <strong style={{ fontSize: 20 }}>{current.name}</strong>
            <span className="muted">
              {" "}
              · {profile.credits} credits left · refills{" "}
              {new Date(profile.credits_reset_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
          {current.id !== "free" && <PlanButton plan="manage" label="Manage subscription" variant="ghost" />}
        </div>
      )}

      <div className="plans">
        {PLANS.map((plan) => {
          const featured = plan.id === "creator";
          const isCurrent = current?.id === plan.id;
          return (
            <div key={plan.id} className={`plan ${featured ? "featured" : ""}`}>
              <div className="row between">
                <h3>{plan.name}</h3>
                {featured && <span className="pill">Most popular</span>}
              </div>
              <div className="price">
                €{plan.priceEur.toFixed(plan.priceEur ? 2 : 0)}
                <small> / month</small>
              </div>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check size={18} /> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button className={`btn ${featured ? "btn-primary" : "btn-ghost"}`} disabled>
                  Current plan
                </button>
              ) : plan.id === "free" ? (
                profile ? (
                  <PlanButton plan="manage" label="Downgrade" variant="ghost" />
                ) : (
                  <a className="btn btn-ghost" href="/login?mode=signup">
                    Start free
                  </a>
                )
              ) : profile ? (
                <PlanButton plan={plan.id} label={`Get ${plan.name}`} variant={featured ? "primary" : "dark"} />
              ) : (
                <a className={`btn ${featured ? "btn-primary" : "btn-dark"}`} href="/login?next=/subscription">
                  Get {plan.name}
                </a>
              )}
            </div>
          );
        })}
      </div>
      {demo && (
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          Billing runs in demo mode until Stripe keys are added. Plan buttons switch plans instantly without payment.
        </p>
      )}
    </div>
  );
}
