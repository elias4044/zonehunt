<div align="center">
<img src="./public/icon.svg" with="50" height="50">
<h1>ZoneHunt</h1>
</div>

This is a small project I've been working on for about half a year. A small fun game you can play w/ your friends. Fully self-hostable!
Note; this is still in early beta, expect large changes.
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

// Was made with ❤️ by Elias.
