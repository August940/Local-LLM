# dressmaker.ai

AI fashion design studio: describe an outfit or upload a reference, and the
generation queue turns it into images or short videos (Wan 2.2) on a cloud GPU.

Built with Next.js 15 (App Router) + Supabase (auth, Postgres, storage, realtime).

## Features

- **Collapsible sidebar**: Home, Chat, Generator, Explore, My AI, Subscription, Login (state remembered, off-canvas on mobile)
- **Generator**: prompt field, example prompts, reference image upload (drag & drop), style + aspect ratio, negative prompt, saved style presets, image/video toggle
- **Queue**: jobs stored in `generations`, priority by plan, live queue position and status via polling + Supabase Realtime, cancel with refund, automatic refund on failure/timeouts
- **Gallery** (My AI): your stored results, favourites and presets; download, delete, share to Explore
- **Explore**: public community gallery, remix any prompt
- **Login**: email/password and Google OAuth via Supabase Auth
- **Subscription**: Free / Creator / Studio plans with monthly credits; Stripe Checkout + webhook, or demo billing when Stripe keys are missing
- **Chat**: stylist assistant that turns ideas into prompts (any OpenAI-compatible endpoint, e.g. Ollama; falls back to a built-in helper)
- **Content policy**: `/policy` page, server-side prompt screening (`lib/policy.ts`) and a safety negative prompt on every job

## Setup

1. `npm install`
2. Create a Supabase project and run `supabase/migrations/20261028150000_dressmaker_init.sql`
   (SQL editor or `supabase db push`). It creates tables, RLS, storage buckets and queue functions.
3. In Supabase Auth, add `http://localhost:3000/auth/callback` (and your production URL) as redirect URLs.
   Enable the Google provider if you want Google login.
4. `cp .env.example .env.local` and fill in the keys.
5. `npm run dev` and open http://localhost:3000

## Generation backend

Set `GENERATION_PROVIDER`:

- `mock` (default): no GPU needed. Renders a branded placeholder so the queue, storage and gallery work end to end.
- `api` (recommended): calls the serverless generation backend at `GENERATION_API_URL`, which wraps the
  ComfyUI / Wan 2.2 workflow on a cloud GPU. Contract is documented in `lib/generation/http.ts`:
  `POST /generate` and `GET /status/{id}` returning `queued | processing | completed | failed`.
- `comfyui`: talks to a ComfyUI server directly at `COMFYUI_URL`, using the API-format workflows in
  `workflows/` (`image.json`, `image_ref.json`, `video.json` for Wan 2.2 TI2V 5B) with `{{PROMPT}}`,
  `{{NEGATIVE}}`, `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{INPUT_IMAGE}}` placeholders.

The worker (`lib/generation/queue.ts`) runs right after a job is queued and on every call to
`/api/queue/tick` (Vercel Cron every minute via `vercel.json`, or any cron with
`Authorization: Bearer $QUEUE_CRON_SECRET`). Long video jobs are polled on later ticks.

## Billing

Without `STRIPE_SECRET_KEY`, and with `ALLOW_DEMO_BILLING=true`, plan buttons switch plans instantly (for testing).
For real payments create two recurring prices in Stripe, set `STRIPE_PRICE_CREATOR` / `STRIPE_PRICE_STUDIO`,
and point a webhook at `/api/billing/webhook` with `checkout.session.completed`, `invoice.paid` and
`customer.subscription.deleted`. Set `ALLOW_DEMO_BILLING=false` in production.

## Legacy

The earlier Kindred / Ollama companion-chat prototype is kept in `legacy/kindred/`.
