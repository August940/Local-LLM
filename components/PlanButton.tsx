"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

export function PlanButton({
  plan,
  label,
  variant,
}: {
  plan: string;
  label: string;
  variant: "primary" | "ghost";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    const res = await fetch(plan === "manage" ? "/api/billing/portal" : "/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) {
      setError(json.error ?? "Something went wrong");
      setLoading(false);
      return;
    }
    window.location.href = json.url;
  }

  return (
    <>
      <button className={`btn btn-${variant}`} onClick={go} disabled={loading}>
        {loading && <LoaderCircle size={16} className="spin" />}
        {label}
      </button>
      {error && (
        <div className="notice error" style={{ marginTop: 10, marginBottom: 0 }}>
          {error}
        </div>
      )}
    </>
  );
}
