# TrackMe AI

An intelligent personal planner for college students — combines your timetable, exams,
assignments, tasks, study goals and placement-prep goals into one view, and surfaces
what to focus on each day. Data is saved to your browser's local storage, so it
persists between visits on the same device/browser.

## Run it locally

You'll need [Node.js](https://nodejs.org) 18+ installed.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
```

This outputs a static site into the `dist/` folder — that folder is all any host needs.

---

## Deploy — pick one

### Option A: Vercel (easiest)
1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Vercel auto-detects Vite. Leave the defaults (`npm run build`, output `dist`) and click **Deploy**.
4. You'll get a live `*.vercel.app` URL immediately; add a custom domain under Project → Settings → Domains if you have one.

### Option B: Netlify
1. Push this folder to a GitHub repo.
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Build command: `npm run build`  ·  Publish directory: `dist`
4. Deploy — you'll get a `*.netlify.app` URL, with custom domain support in Site settings.

### Option C: GitHub Pages
1. Install the helper: `npm install --save-dev gh-pages`
2. In `package.json`, add:
   ```json
   "homepage": "https://<your-username>.github.io/<repo-name>",
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```
3. In `vite.config.js`, set `base: "/<repo-name>/"` inside `defineConfig({...})`.
4. Run:
   ```bash
   npm run deploy
   ```
5. In your repo settings → Pages, set the source to the `gh-pages` branch.

---

## Notes

- All data (tasks, timetable, exams, goals) lives in the browser's `localStorage` under
  the key `trackme-data-v1` — nothing is sent to a server. Clearing browser data/site
  data will reset the app.
- The "AI suggestions" on the Today view are computed locally from your own data
  (priority × urgency scoring) — no API key or backend required.
- Icons come from [lucide-react](https://lucide.dev); fonts (`Fraunces`, `IBM Plex Sans`)
  load from Google Fonts.
