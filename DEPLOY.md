Deployment notes for Vercel

Quick summary
- Your repo uses a Node server (`server.js`) and needs `public/`, `models/` and some JSON files included in the serverless bundle. That's handled via `vercel.json` `builds.includeFiles`.
- Vercel will warn when that `builds` section exists (it means Project Settings Build & Dev options are ignored). That warning is informational — keep `builds` if you want the repo to control bundling.
- The `npm warn allow-scripts` messages are Vercel asking for approval to run package `postinstall` scripts during build. These come from dependencies like `@firebase/util` and `protobufjs`.

Required environment variables (set in Vercel Project > Settings > Environment Variables):
- `JWT_SECRET` (string) — required for authentication.
- `FIREBASE_SERVICE_ACCOUNT` (string) — either raw JSON or base64-encoded JSON for Firebase Admin SDK.
  - Example (raw): paste the full service account JSON value.
  - Example (base64): set `FIREBASE_SERVICE_ACCOUNT` to the base64 string and the server already supports decoding.
- `ENCRYPTION_SECRET` (optional) — used for local encryption utilities; default exists in code but set it in production.

How to approve npm install scripts (recommended)
1. Push code to GitHub (already done).
2. Go to Vercel Dashboard → Project → Deployments.
3. Open the latest deployment (the failing one).
4. In the Build Logs you will see a section mentioning `allow-scripts` and packages pending approval.
5. There will be a button or link like "Approve install scripts" (or similar) inside the log UI. Click it and confirm. This allows the postinstall scripts for this deployment or project.

Alternative: pre-build & deploy a bundle
- If you prefer not to approve scripts on Vercel, create a CI pipeline (GitHub Actions) that runs `npm ci` and builds the server bundle, then deploy the built artifact to Vercel using the `vercel` CLI or GitHub integration. This avoids running postinstall scripts on Vercel.

Notes about `vercel.json` and builds
- Two valid approaches:
  - Let `vercel.json` control the build (keep `builds` with `includeFiles`). This is useful for server-side bundles needing local assets.
  - Remove `builds` and configure Project Settings in the Vercel dashboard (Build Command, Output Directory). Use this if you want build config centralized in Vercel settings.
- If you keep `builds` the dashboard will show the warning you saw. It's safe — it just means the repo wins.

If you want, I can:
- Add a minimal GitHub Actions workflow to preinstall and build (and optionally deploy) so you avoid approving scripts on Vercel.
- Walk you through approving the scripts in the Vercel UI and re-deploy.

Contact me which option you want and I'll implement it and push the changes.
