# Hosting Zonehunt

The short version: **one PocketBase process serves everything**, and you point one hostname at it.

```
https://hunt.example.com/        the app (the PWA)
https://hunt.example.com/api/    the game API and PocketBase's own API (only the app talks to this)
https://hunt.example.com/_/      PocketBase admin (you, not players)
```

The app lives at the root. `/api/` is just where PocketBase keeps its API, and players never see it. If you open your hostname and get JSON or a 404 instead of the game, the built app is missing, see "Troubleshooting" at the bottom.

## 1. Build and install

On your dev machine:

```bash
bun install
bun run deploy          # builds the app into pocketbase/pb_public
```

Download the PocketBase binary for the server (0.30 or newer, `linux_amd64` for a normal PC or laptop) and put it in `pocketbase/` so the folder looks like this:

```
pocketbase/
  pocketbase        the binary
  pb_hooks/         game logic
  pb_migrations/    database schema
  pb_public/        the built app (made by bun run deploy)
```

Copy that whole folder to the server, for example to `/opt/zonehunt/pocketbase`:

```bash
rsync -a --exclude pb_data pocketbase/ you@server:/opt/zonehunt/pocketbase/
```

## 2. Run it

**As a service (simplest on your laptop).** Copy `deploy/zonehunt.service` to `/etc/systemd/system/`, then:

```bash
sudo useradd --system --home /opt/zonehunt zonehunt        # once
sudo chown -R zonehunt: /opt/zonehunt
sudo systemctl daemon-reload
sudo systemctl enable --now zonehunt
```

It listens on `127.0.0.1:8090` only, so nothing outside the machine can reach it except through the tunnel.

**With Coolify.** Create a new resource from this repository using the Dockerfile build pack, then:
- Port: `8090`.
- Domain: `https://hunt.example.com` (the hostname you want players to use).
- Persistent storage: mount a volume at `/pb/pb_data`.

The Dockerfile is **untested**, because I had no Docker daemon to build it with. If the build fails, it will most likely be the PocketBase download line or the npm step.

## 3. Forward it with Cloudflare Tunnel

Players need an `https://` address. Browsers block GPS, keeping the screen awake and installing the app on plain `http://` pages, so a LAN address like `http://192.168.1.20:8090` will not work for a real game.

**In the Cloudflare dashboard** (the tunnel you already run):
1. Zero Trust, Networks, Tunnels, pick your tunnel, open its hostname routes. The tab is called **Public hostname**, and newer dashboards may label it **Published application routes**.
2. Add a route: subdomain `hunt`, domain `e4044.com` (or whichever you want), **leave the path empty**, service type `HTTP`, URL `127.0.0.1:8090`.
3. Save. Cloudflare creates the DNS record for you.

**Or with a config file:** see `deploy/cloudflared-config.example.yml`. After editing it, run `cloudflared tunnel route dns <tunnel-name> hunt.example.com` once and restart cloudflared.

The one mistake to avoid: **do not put a path on the route** (for example `/api`). That sends only part of the site to PocketBase. The route is the whole hostname, no path.

## 4. First-time settings in PocketBase

Open `https://hunt.example.com/_/`. The first visit asks you to create a superuser. Use a long password. Then:

- **Trusted proxy header.** Settings, Application, **User IP proxy headers**: add `CF-Connecting-IP`. Behind a tunnel PocketBase otherwise sees every player as the same IP, so the join-code rate limit (15 per minute) would be shared by everyone.
- **Rate limits.** The migration already switched these on, with limits for creating and joining games. You can check them under Settings.
- **Lock the admin page** (recommended). In Cloudflare Zero Trust, Access, Applications, add a self-hosted application for `hunt.example.com` with the path `/_/*`, and allow only your own email. Players never need that page, so this closes it to everyone else. I could not test this from here, so check the dashboard wording against what you see.

## 5. Check that it works

From any computer:

```bash
curl -s https://hunt.example.com/api/health        # {"message":"API is healthy.",...}
curl -sI https://hunt.example.com/ | head -1       # HTTP/2 200
```

Then on a phone, open the address in Chrome. The home screen shows an **Install the app** button, or Chrome's menu offers **Install app**. For a full report, open Chrome DevTools on a computer, Application, Manifest: it lists anything blocking installation.

On iPhone: Share, then **Add to Home Screen**. iPhone has no install button.

## 6. Updating

```bash
bun run deploy
rsync -a --exclude pb_data pocketbase/ you@server:/opt/zonehunt/pocketbase/
ssh you@server sudo systemctl restart zonehunt
```

Players pick up the new version the next time they open the app. PocketBase tells browsers to recheck the app files every time (see the cache headers in `pb_hooks/zonehunt.pb.js`), so Cloudflare will not serve a stale copy, and the hashed build files are cached forever because they never change. Games in progress survive a restart, but players see "Reconnecting" for a few seconds.

## Alternative: app and API on separate hostnames

If you would rather host the static app somewhere else (Cloudflare Pages, Netlify, any static host) and keep PocketBase on its own hostname:

```bash
PB_URL=https://api.example.com bash scripts/build-and-copy.sh
# upload the ./out folder to the static host, at hunt.example.com
```

and point a tunnel route for `api.example.com` at PocketBase. PocketBase already allows cross-origin requests, so no extra setup. I tested this arrangement locally (app on one port, API on another, full browser test passes), but not through real Cloudflare hostnames. The downside is two things to keep in sync, so I would only do it if you have a reason to.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| JSON or "not found" at the root of the hostname | `pb_public` is missing or not next to the binary. Run `bun run deploy` and copy it over. |
| Part of the site works, part 404s | The tunnel route has a path on it. Remove the path. |
| Chrome offers no install | The page is not `https://`, or you are on iPhone (use Add to Home Screen). Check DevTools, Application, Manifest. |
| GPS or "keep screen awake" warnings on every phone | Same: the page is not served over HTTPS. |
| New version does not show up | Reload once. If it persists, check that the tunnel is not behind another cache and that `/sw.js` returns `Cache-Control: no-cache`. |
| "Too many requests" for everyone | The trusted proxy header in section 4 is not set. |
