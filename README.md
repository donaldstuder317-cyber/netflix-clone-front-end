# Agentic Netflix Clone — Front-End

> **Disclaimer:** This project is an educational **clone** of Netflix, built as a CodePlatoon assignment. It is not affiliated with, endorsed by, or connected to Netflix, Inc. All titles, artwork, and branding are used for learning purposes only. Donations made through the demo `/donate` page run in Stripe **test mode** and never move real money.

A multi-page streaming UI with sign-in, browsing, search, a personal My List, resumable playback, and a Stripe-powered donate page. This folder contains only the front-end; the database and serverless functions (Supabase) live in a separate part of the project and are not included in this repository.

## Tech stack

- **Vite** multi-page build (every HTML file is an entry point)
- **Vanilla HTML/CSS/JS** for the main pages, **React 19** + React Router for `/donate`
- **Supabase** (`@supabase/supabase-js`) for Auth, Postgres with Row Level Security, and Edge Functions
- **Axios** for calls to Supabase Edge Functions (TMDB lookups, donation processing)
- **Stripe** (`@stripe/react-stripe-js`) for the test-mode donate flow

## Project structure

```
front-end/
├── index.html            # Sign-in
├── src/
│   ├── pages/            # browse, search, my-list, player, title-detail, sign-up, donate
│   ├── css/styles.css
│   ├── js/               # app.js, api.js, data.js, supabase.js
│   └── react/            # Donate.jsx, auth.jsx, main.jsx
├── public/               # static assets
├── vite.config.js
└── package.json
```

## Running locally

Prerequisites: Node.js 18+ and a Supabase project with the schema and seed data loaded.

```bash
npm install
cp .env.example .env     # then fill in your own values
npm run dev              # http://localhost:5173
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe **publishable** test key (`pk_test_...`) |

Only publishable keys belong here. Anything prefixed `VITE_` is bundled into the browser build and is public. Never put a Stripe secret key or Supabase service-role key in this app. `.env` is git-ignored.

## Build and deploy

```bash
npm run build            # outputs static files to dist/
npm run preview          # serve the production build locally
```

The build output is fully static, so it can be hosted on any static host. Deploying to **Vercel** or **Netlify**:

1. Import the GitHub repository and set the **root directory** to the repo root (this repo contains only the front-end).
2. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. Add the three environment variables above in the host's dashboard (Project Settings → Environment Variables).
4. Add a rewrite so `/donate` resolves to `/src/pages/donate.html` (the dev server does this in `vite.config.js`; static hosts need it configured).
5. In Supabase (Authentication → URL Configuration), add your deployed URL to the allowed site/redirect URLs.

## Trying the app

There is no shared demo login. Open the app, choose **No account? Sign up**, and create your own account (password: 8+ characters with an uppercase letter, a number, and a symbol, e.g. `Netflix#2026`). Each account only sees its own My List and watch progress.

- **Browse / Search:** the catalog loads and search filters as you type (title or genre).
- **My List:** add or remove titles; they persist per account.
- **Resume:** leave the player and the title shows **Resume** and appears under Continue Watching.
- **Donate:** use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

## Security notes

- Data access is enforced in the database with Row Level Security, not in this client code.
- The browser only ever holds publishable keys. Secrets live in Supabase Edge Function environment variables.
- Never commit `.env` files.
