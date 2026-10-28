"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signInWithGoogle, signUp, type AuthState } from "@/app/login/actions";
import { LogoMark } from "./Logo";

export function LoginForm({
  next,
  initialError,
  initialMode,
  configured,
}: {
  next: string;
  initialError?: string;
  initialMode: "signin" | "signup";
  configured: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signin" ? signIn : signUp, {
    error: initialError,
  });

  return (
    <>
      <LogoMark size={44} />
      <h1 style={{ marginTop: 18 }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        {mode === "signin" ? "Log in to keep designing." : "Get 20 free credits to start designing."}
      </p>

      {!configured && (
        <div className="notice">Supabase keys are missing. Copy .env.example to .env.local and fill them in.</div>
      )}
      {state.error && <div className="notice error">{state.error}</div>}
      {state.message && <div className="notice">{state.message}</div>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-ghost" style={{ width: "100%" }} disabled={!configured}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="divider">or with email</div>

      <form action={action}>
        <input type="hidden" name="next" value={next} />
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input className="input" id="name" name="name" autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />
        </div>
        {mode === "signup" && (
          <label className="row" style={{ fontSize: 14, marginBottom: 18, alignItems: "flex-start" }}>
            <input type="checkbox" name="policy" required style={{ marginTop: 3 }} />
            <span>
              I am 18 or older and agree to the{" "}
              <Link href="/policy" className="gradient-text" style={{ fontWeight: 600 }}>
                content policy
              </Link>
              .
            </span>
          </label>
        )}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={pending || !configured}>
          {pending ? "Please wait…" : mode === "signin" ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: 14 }}>
        {mode === "signin" ? "New to dressmaker.ai? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{ background: "none", border: 0, cursor: "pointer", fontWeight: 600, padding: 0 }}
          className="gradient-text"
        >
          {mode === "signin" ? "Create an account" : "Log in"}
        </button>
      </p>
    </>
  );
}
