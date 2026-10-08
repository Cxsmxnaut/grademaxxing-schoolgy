# Vendored: TailAdmin Free React Dashboard Template

This directory vendors [TailAdmin's free React Tailwind dashboard template](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
(version 2.4.0), used as the design system and shell for the Grademaxxing admin
console served at `admin.grademaxxing.app`.

- License: MIT (see `LICENSE.md`; keep it with this directory).
- Upstream: `TailAdmin/free-react-tailwind-admin-dashboard`, `main` at the time
  of vendoring.
-Local modifications: Grademaxxing branding and navigation, a sign-in form
wired to `/api/admin/session`, and real operations pages (dashboard, feedback
inbox, referrals, protected users, profile) backed by the `/api/admin/*` API.

The build (`npm run build:admin` from the repository root) compiles this app
into `../static/admin-app`, which the Cloudflare Worker serves under
`/admin-app/` (see `../src/hooks.server.ts`). The source directory is named
`admin-console` on purpose: a directory called `admin-app/` would shadow the
`/admin-app/` URL space in the Vite dev server.
