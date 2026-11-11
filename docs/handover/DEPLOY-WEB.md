# Hosting the web app (PWA)

The web app is the `dist/` folder from `npm run build`: static files, no server. Any static host works. Vercel is the simplest: the
repository has a `vercel.json` (build command, output folder, and the cache headers below).

Headers that matter (already in `vercel.json`; copy them to another host):

- `/sw.js` and `/index.html`: `Cache-Control: no-cache`, so a new release reaches users on the next visit. The service worker is
  versioned per build (`scripts/build-sw.mjs`) and precaches every file, so after the first visit the app works offline.
- `/assets/*`: `public, max-age=31536000, immutable` (file names carry a content hash).
- Serve over HTTPS (service workers need it).

Steps on Vercel: import the repository, framework "Other", leave the defaults (they come from `vercel.json`), deploy the `main`
branch (or the release tag). Check: open the site, switch the network off, reload: the app still opens (`npm run test:offline`
checks the same on the build).

Updates: there is no auto-updater at launch. The web app updates itself on the next visit; the Windows installer is replaced by
installing a newer version from the GitHub releases page (the version and build are on the About screen).
