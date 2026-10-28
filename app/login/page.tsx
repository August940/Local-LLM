import { LoginForm } from "@/components/LoginForm";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Login · dressmaker.ai" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <LoginForm
          next={sp.next ?? "/generator"}
          initialError={sp.error}
          initialMode={sp.mode === "signup" ? "signup" : "signin"}
          configured={isSupabaseConfigured}
        />
      </div>
    </div>
  );
}
