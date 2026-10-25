# Zonehunt: design

A real-life manhunt as an installable website (PWA). Players split into chasers and runners, agree on a play zone, and the game runs on a timer. Chasers see runner positions only in timed snapshots. Runners get a compass toward nearby chasers. A catch is recorded by typing the 4-digit code shown on the runner's phone.

This is an original app that follows the same rules as the reference you shared. Names, visuals and copy are new.

## 1. The one hard limit

**A web app cannot track location in the background.** When the screen locks or the player switches app, the browser suspends the page and GPS updates stop. Native apps can avoid this. A PWA cannot.

Everything below is designed around that:

- The app holds a screen wake lock for the whole game and re-requests it when the page returns to the foreground.
- The pre-game checklist tells players plainly that the screen must stay on and the app must stay open.
- The server treats positions older than 90 s as unusable. It never fakes a position, and it tells everyone when someone has gone quiet ("Not heard from 2 min ago" in the menu).
- Installing the PWA to the home screen is encouraged. It behaves better than a browser tab, especially on iPhone.
- A game must still work when a phone drops out for a while. Any phone that comes back catches up in one request.

If you later need true background tracking, the only route is a native or Capacitor wrapper. The backend would not change.

## 2. Rules, mapped to features

| Rule from the reference | How it works here |
|---|---|
| Create a private game, share a join code | 6-character code from an alphabet with no 0/O/1/I. Share sheet or copy. |
| Chasers and runners, optional referee | Roles chosen in the lobby. Host can assign anyone or shuffle teams. Referee sees everyone live. |
| Draw a play zone | Circle (tap centre, slider) or polygon (tap corners). Leaving it triggers a warning and vibration. |
| Game duration, reveal interval | Host settings: 10 min to 2 h, reveals every 15 s to 5 min. |
| Head start | Host setting. No reveals and no catches during it. |
| Chasers get timed runner positions | The server snapshots runner positions on a timer. Chasers only ever see the latest snapshot, and old dots fade. |
| Runner compass | Server computes nearest chaser inside the compass range. The client gets a bearing and a rounded distance, never coordinates. |
| Catch by code | Chaser types the runner's 4-digit code. No contact needed. Wrong guesses are rate-limited. |
| Win conditions | Chasers win if every runner is caught. Runners win if one is still free at time-out. |
| Power-ups | Scan (chaser): forces a reveal now. Stealth (runner): hidden from the next reveals for 45 s. Both have cooldowns and can be turned off. |
| Pause for safety | Any player can pause. Only the host resumes. All deadlines shift by the paused time. |
| Data deleted after the game | Ended games are deleted 5 minutes after the end. Positions, reveals and the feed go with them (cascade delete). |

Not included: Hide and Seek mode, Pro limits, accounts, and the public spectator page. The last one is deliberate. Making positions public to anyone with a code is a privacy risk. A referee role covers the need.

## 3. Architecture

```
 Phone (Next.js static export, PWA)            PocketBase (one process)
 ┌───────────────────────────────┐             ┌─────────────────────────────────┐
 │ GPS watch + heartbeat         │  POST sync  │ pb_hooks: /api/mh/*             │
 │ Wake lock                     ├────────────►│  game rules, clock, visibility  │
 │ Sync loop (4 s, backs off)    │◄────────────┤ SQLite collections + API rules  │
 │ Realtime = "sync now" nudge   │  full state │ cron: tick + cleanup (1/min)    │
 │ Service worker (shell, tiles) │             │ pb_public: serves the built app │
 └───────────────────────────────┘             └─────────────────────────────────┘
```

**Why this split.** You asked for a minimal backend that leans on PocketBase. The rules live in PocketBase's JS hooks, inside the same binary. There is no separate Node server. The frontend is a static export that PocketBase serves itself, so the app and API share one origin (no CORS) and deployment is one process behind your Cloudflare Tunnel.

**Why clients never write directly.** Position data is the sensitive part. If clients could write to collections, the API rules would have to express "chasers see runners only on reveal" and "a catch needs proximity", and they cannot. So every write goes through a route in `pb_hooks`, and the collection rules only allow limited reads.

**Why one sync endpoint.** The phone posts its GPS fix to `/api/mh/sync` every few seconds. The response contains everything the screen needs: game state, roster, its own status, compass, any new reveal, and new feed events. This is the key reliability decision:

- A phone that slept for two minutes catches up with one request.
- There is no websocket state to repair after a bad connection.
- PocketBase realtime still runs, but only as a hint to sync early. If it dies, nothing breaks.

## 4. Data model

| Collection | Purpose | Client access |
|---|---|---|
| `games` | config, status, clock fields, join code | read, only your own game |
| `players` (auth) | one throwaway account per person per game: name, role, status, catch code, cooldowns | read roster of your own game. Catch code and counters are hidden fields. |
| `positions` | latest fix per player, plus "last heard from" | **no client access at all** |
| `reveals` | runner snapshots for chasers | read only if you are a chaser or referee, or you have been caught |
| `events` | the game feed | read, your own game |

Players are auth records created by the server on create or join, with a random email and password that nobody uses. The token comes straight from the route. No sign-up, no email, no password.

## 5. Game clock

All time is server time. Phones estimate the offset from each sync response, so countdowns stay right even if a phone's clock is wrong.

The clock advances in two places:

1. **On every sync.** A cheap check runs first, and only when something is due does it open a transaction. It re-reads the game inside the transaction, so two phones ticking at once cannot produce a double reveal.
2. **A cron job every minute**, so the game still ends on time if every phone is asleep.

States: `lobby` → `active` ⇄ `paused` → `ended`. Abandoned games close after 30 minutes with nobody connected. Unstarted lobbies expire after 12 hours.

## 6. Fairness and anti-cheat

Realistic for friends playing together, not a tournament.

- Runner positions never reach a runner's phone. Chasers receive only the snapshot, not live positions.
- The compass returns a bearing and a rounded distance, not coordinates.
- Catch codes are 4 digits, unique per game. Five wrong guesses lock a chaser out for 30 s.
- A catch also needs both players within the catch distance, with GPS accuracy allowed for. This stops a screenshotted code winning the game. The host can set it to "No check".
- Out-of-zone detection is client-side and server-side, so the warning is instant and the server flag cannot be switched off.
- Spoofed GPS is out of scope. Anyone willing to fake their location can win. Play with friends.

## 7. Reliability checklist

What was built, and what is only a note:

- **Built:** wake lock with re-acquire on return to the page.
- **Built:** GPS watch restarted on every return to the page, since mobile browsers quietly kill watches in the background.
- **Built:** a stationary phone is not treated as a broken GPS. Browsers stop firing position callbacks when you stand still, so the app keeps the last fix fresh and only reports a problem when the GPS itself reports one. Fixes are stamped when they arrive, because some browsers return old device timestamps.
- **Built:** sync backs off up to 15 s when failing, shows a "weak" then "offline" banner, and syncs immediately when the page returns or the network comes back.
- **Built:** the session lives in storage. A reload, crash or phone call puts you back in the same game. A game deleted on the server returns you home with a clear message.
- **Built:** service worker caches the app shell (so it opens with no signal) and map tiles you have already seen. It never caches API calls.
- **Built:** every server action returns a plain-language reason (`data.reason.code`) the UI turns into a readable message.
- **Built:** join-code and create-game rate limits (15 and 10 per minute per IP). Confirmed active in PocketBase's settings after the migration runs.
- **Built:** the map never moves a view the player has taken over. Any touch, wheel or pinch switches auto-follow off, and only the recenter button turns it back on. Following nudges the view only when you near the edge and never changes zoom. Markers are updated in place instead of rebuilt, so nothing flickers on each update. `scripts/map-test.mjs` guards this.
- **Built:** install prompt captured by a script in the page head, so it cannot be missed if it fires before the app has loaded or while you are inside a game. The home screen warns when the page is not HTTPS, because that alone disables install, GPS and the wake lock.
- **Built:** PocketBase sends `Cache-Control: no-cache` for the app files and `immutable` for hashed build files, so a CDN cannot serve a stale `sw.js` after a deploy.
- **Built:** Leaflet's animated-zoom timer is disarmed before the map is torn down. Without it, pressing Start straight after saving the zone threw an error on the host's phone.
- **Verified:** a game, its player tokens, catch codes and clock all survive a PocketBase restart.
- **Note:** behind Cloudflare Tunnel, PocketBase sees one IP unless you trust the `CF-Connecting-IP` header in its settings. Without that, the rate limit is shared by everyone.
- **Note:** the default map tiles are OpenStreetMap's public servers. Their policy does not allow heavy use. Set `NEXT_PUBLIC_TILE_URL` to a proper provider before sharing widely.

## 8. Privacy

- Location is collected only during an active game. In a lobby, the server stores that you are connected but no coordinates.
- Players are throwaway records with just a name. No email, no account.
- Ended games, with all positions and the feed, are deleted 5 minutes after the end.
- No third-party analytics. The only outside request is to the map tile server, which sees tile requests from each player's IP.
- Show the safety notes on the home screen (done): play with people you know, stay off roads and private property, and pause if anyone is hurt. For under-18s, involve a parent or guardian.

## 9. UI notes

- Built to be read outdoors, in sun, on the move: big type, high contrast, large tap targets (minimum 44 px, main actions 64 px).
- The header colour is your role: orange for chasers, blue for runners. It is the one thing that changes between roles, so a glance tells you which side you are on.
- The clock is the biggest thing on screen. Chasers see "next runner update" in the bottom panel, and runners see their compass and catch code.
- Warnings show at most two at a time, most urgent first, so the map stays visible.
- Motion is small and answers something that just happened: screens and list rows rise in, sheets slide up, warnings drop in, the catch result pops with a drawn check. The compass needle swings to its new bearing the short way round. The one big moment is the radar ping that expands from every runner dot when chasers get an update, plus a full-screen "Game on" and "Hunt" or "Run" flash at the start. Everything switches off for people who ask their device for reduced motion.
- Typeface is Archivo, one family at two widths (condensed for numbers, normal for reading).

## 10. Hosting

See [HOSTING.md](HOSTING.md). In short: one hostname, pointed at PocketBase with no path, serves the app at `/`, the API at `/api/` and the admin at `/_/`.

## 11. What I did not test

Everything above was tested with a real PocketBase and a real Chromium (two simulated phones, mocked GPS). I could not test on real devices. Before relying on it, test on at least one iPhone and one Android phone:

- Does the wake lock hold for 30 minutes on iOS, installed and in Safari?
- Does the compass turn with the phone (iOS needs the "Turn compass with me" tap)?
- How does a stationary phone behave after 10 minutes?
- What happens when the browser is switched away for 30 s and returned?
- Chrome's install prompt through your real Cloudflare hostname. Installability checks pass on localhost, and over plain HTTP they fail by design.
- The Dockerfile (no Docker daemon was available) and the Cloudflare Access and dashboard steps in HOSTING.md.
- Running the app and API on separate hostnames was tested locally with two ports, not through real hostnames.

## 12. Ideas for later

- Hide and Seek mode (runners hide in the zone, no runner GPS for chasers).
- Web push for "game started" and "paused", which helps phones that have been left alone.
- Capacitor wrapper if background tracking turns out to matter.
- Spectator link with a separate read-only code and a delay on positions.
- Sound cues, and a "last known position" ghost for caught players.
