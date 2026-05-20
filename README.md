# AcademyDesk

Custom helpdesk + AI Resource Centre for **Warwick Academy, Bermuda**, replacing Spiceworks.

**Stack:** Supabase · GitHub · SendGrid · Netlify (+ OpenAI for the LMRC, Twilio for H&S SMS).

```
apps/web                  React + Vite + Tailwind (Netlify-hosted)
netlify/functions         Serverless endpoints (TypeScript, esbuild)
supabase/migrations       Postgres schema + RLS
supabase/seed.sql         Local dev seed data
.github/workflows         CI
```

## Quick start

```powershell
# 1. Install deps
pnpm install

# 2. Copy env file
Copy-Item .env.example .env

# 3. Run the web app (no Supabase needed for the status page)
pnpm dev
# → http://localhost:5173

# 4. To exercise /api/* (Netlify Functions) locally:
pnpm netlify:dev
# → http://localhost:8888
```

See [STAGES.md](./STAGES.md) for the full step-by-step build walkthrough.
