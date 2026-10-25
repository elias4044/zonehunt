# Zonehunt

A real-life manhunt PWA. Next.js (static export) plus PocketBase. See [DESIGN.md](DESIGN.md) for how and why, and [HOSTING.md](HOSTING.md) for putting it online.

## Run it locally

You need Node 20+ (or Bun) and the PocketBase binary (0.30 or newer).

```bash
bun install        # or: npm install
bun run deploy     # builds the app into pocketbase/pb_public

# put the PocketBase binary in ./pocketbase/, then:
cd pocketbase
./pocketbase serve --http=127.0.0.1:8090
```

Open http://localhost:8090. The first start applies the migration in `pb_migrations/` and loads the rules in `pb_hooks/`. You do not need to create anything in the admin UI.

Phones need **HTTPS** for GPS, the screen wake lock and installing the app. See HOSTING.md for the Cloudflare Tunnel setup.

## Develop

```bash
cd pocketbase && ./pocketbase serve        # terminal 1
bun run dev                                # terminal 2, http://localhost:3000
```

`.env.local` points the dev app at PocketBase on port 8090. In production the app uses the origin it was served from.

## Test

With PocketBase running on port 8090 and a built app:

```bash
node scripts/e2e.mjs                                           # plays a full game through the API
node scripts/browser-test.mjs http://127.0.0.1:8090 ./shots   # two simulated phones in Chromium
node scripts/map-test.mjs http://127.0.0.1:8090 ./shots        # the map stays where the player puts it
```

The browser tests need Playwright (`npm i -D playwright`). Run PocketBase with a throwaway `--dir` so test games don't land in your real data.

## Layout

```
app/, components/, hooks/, lib/   the PWA (hooks/useGameSync.ts is the heart of it)
public/                           manifest, icons, service worker
pocketbase/pb_migrations/         schema and API rules
pocketbase/pb_hooks/              all game logic (handlers.js), routes, cache headers
deploy/                           systemd unit and cloudflared example
Dockerfile                        for Coolify or plain Docker (untested)
scripts/                          deploy script and tests
```
