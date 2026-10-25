// Plays a whole game against a running PocketBase and checks the rules hold.
// Usage: node scripts/e2e.mjs [http://127.0.0.1:8090]

const BASE = process.argv[2] || "http://127.0.0.1:8090"
let failures = 0

async function call(path, body, token) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body || {}),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function get(path, token) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: token } : {} })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

function check(name, cond, extra) {
  if (cond) console.log("  ok   " + name)
  else { failures++; console.log("  FAIL " + name + (extra ? "  -> " + JSON.stringify(extra) : "")) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Roughly Helsingborg town centre. 0.0003 deg of latitude is about 33 m.
const C = { lat: 56.0465, lng: 12.6945 }
const fix = (dLat, dLng) => ({ lat: C.lat + dLat, lng: C.lng + dLng, acc: 8, ts: Date.now() })

console.log("lobby")
const created = await call("/api/mh/games", {
  name: "Hosty", reveal_interval_s: 10, head_start_s: 2, duration_s: 120, catch_radius_m: 100,
})
check("create game", created.status === 200 && created.json.game?.code?.length === 6, created)
const host = created.json
const code = host.game.code

const a = (await call("/api/mh/join", { code: code.toLowerCase(), name: "Ada" })).json
const b = (await call("/api/mh/join", { code, name: "Bo" })).json
check("join works", !!a.token && !!b.token)
const dup = await call("/api/mh/join", { code, name: "ada" })
check("duplicate name rejected", dup.status === 409 && dup.json.data?.reason?.code === "name_taken", dup)
const bad = await call("/api/mh/join", { code: "ZZZZZZ", name: "Nope" })
check("unknown code rejected", bad.status === 404, bad)

console.log("setup")
const early = await call("/api/mh/start", {}, host.token)
check("cannot start without zone", early.status === 409 && early.json.data?.reason?.code === "zone_missing", early)
const cfg = await call("/api/mh/config", { zone: { type: "circle", lat: C.lat, lng: C.lng, radius: 500 } }, host.token)
check("host sets zone", cfg.status === 200 && cfg.json.game.zone?.radius === 500, cfg)
const notHost = await call("/api/mh/config", { duration_s: 999 }, a.token)
check("non-host cannot configure", notHost.status === 403, notHost)

await call("/api/mh/role", { role: "chaser" }, host.token)
await call("/api/mh/role", { role: "runner" }, a.token)
await call("/api/mh/role", { role: "runner" }, b.token)
const notReady = await call("/api/mh/start", {}, host.token)
check("cannot start while players aren't ready", notReady.status === 409 && notReady.json.data?.reason?.code === "not_ready", notReady)
await call("/api/mh/ready", { ready: true }, a.token)
await call("/api/mh/ready", { ready: true }, b.token)

console.log("start")
const started = await call("/api/mh/start", {}, host.token)
check("game starts", started.status === 200 && started.json.game.status === "active", started)

// Ada is 33 m from the chaser, Bo is ~400 m away.
let sa = await call("/api/mh/sync", fix(0.0003, 0), a.token)
let sb = await call("/api/mh/sync", fix(0.0036, 0), b.token)
const early1 = await call("/api/mh/catch", { code: sa.json.me.catch_code }, host.token)
check("no catches during the head start", early1.status === 409 && early1.json.data?.reason?.code === "head_start", early1)
await sleep(2300)
let sh = await call("/api/mh/sync", fix(0, 0), host.token)
check("runner gets a catch code", /^\d{4}$/.test(sa.json.me?.catch_code || ""), sa.json.me)
check("chaser has no catch code", sh.json.me?.catch_code === "")
check("runners see no reveal", sa.json.reveal === null)
check("chaser gets the first reveal", sh.json.reveal?.seq === 1, sh.json.reveal)
const names = (sh.json.reveal?.points || []).map((p) => p.name).sort()
check("reveal lists both runners", names.join() === "Ada,Bo", names)

sa = await call("/api/mh/sync", fix(0.0003, 0), a.token)
check("runner compass points to the chaser", sa.json.compass && sa.json.compass.distance <= 50 && (sa.json.compass.bearing > 170 && sa.json.compass.bearing < 190), sa.json.compass)
sb = await call("/api/mh/sync", fix(0.0036, 0), b.token)
check("far runner has no compass (out of range)", sb.json.compass === null, sb.json.compass)
check("runner payload has no live positions", sa.json.live === null && sa.json.reveal === null)

console.log("visibility")
const peek = await get("/api/collections/positions/records", b.token)
check("players cannot read positions", peek.status === 403 || (peek.json.items || []).length === 0, peek)
const peekReveals = await get("/api/collections/reveals/records", b.token)
check("runners cannot read reveals", peekReveals.status === 403 || (peekReveals.json.items || []).length === 0, peekReveals)
const roster = await get("/api/collections/players/records", b.token)
check("roster hides catch codes", roster.status === 200 && roster.json.items.every((p) => p.catch_code === undefined), roster.json.items?.[0])
const chaserReveals = await get("/api/collections/reveals/records", host.token)
check("chasers can read reveals", chaserReveals.status === 200 && chaserReveals.json.items.length >= 1, chaserReveals)

console.log("catching")
const wrong = await call("/api/mh/catch", { code: "0000" === sa.json.me.catch_code ? "1111" : "0000" }, host.token)
check("wrong code rejected", wrong.status === 404, wrong)
const farCatch = await call("/api/mh/catch", { code: sb.json.me.catch_code }, host.token)
check("catch refused when too far", farCatch.status === 409 && farCatch.json.data?.reason?.code === "too_far", farCatch)
const runnerCatch = await call("/api/mh/catch", { code: sb.json.me.catch_code }, a.token)
check("runners cannot catch", runnerCatch.status === 403, runnerCatch)
const ok = await call("/api/mh/catch", { code: sa.json.me.catch_code }, host.token)
check("close catch works", ok.status === 200 && ok.json.remaining === 1, ok)

console.log("power-ups and pause")
const stealth = await call("/api/mh/powerup", { type: "stealth" }, b.token)
check("stealth works", stealth.status === 200, stealth)
const stealthAgain = await call("/api/mh/powerup", { type: "stealth" }, b.token)
check("stealth has a cooldown", stealthAgain.status === 409, stealthAgain)
const scan = await call("/api/mh/powerup", { type: "scan" }, host.token)
check("scan works", scan.status === 200, scan)
sh = await call("/api/mh/sync", { ...fix(0, 0), reveal_seq: 1 }, host.token)
check("scan reveal hides the stealthed runner", sh.json.reveal?.kind === "scan" && sh.json.reveal.points.length === 0, sh.json.reveal)

const paused = await call("/api/mh/pause", { paused: true }, b.token)
check("any player can pause", paused.status === 200 && paused.json.game.status === "paused", paused)
const resumeNotHost = await call("/api/mh/pause", { paused: false }, b.token)
check("only host resumes", resumeNotHost.status === 403, resumeNotHost)
const endsBefore = paused.json.game.ends_at
await sleep(1500)
const resumed = await call("/api/mh/pause", { paused: false }, host.token)
check("host resumes and the clock shifts", resumed.status === 200 && resumed.json.game.ends_at > endsBefore + 1000, resumed.json.game)

console.log("finish")
sb = await call("/api/mh/sync", fix(0.0003, 0), b.token)
const last = await call("/api/mh/catch", { code: sb.json.me.catch_code }, host.token)
check("last catch ends the game for the chasers", last.status === 200, last)
sh = await call("/api/mh/sync", fix(0, 0), host.token)
check("game is ended with chasers winning", sh.json.game.status === "ended" && sh.json.game.winner === "chasers", sh.json.game)
check("feed has the story", sh.json.events.length >= 5, sh.json.events.length)

const left = await call("/api/mh/leave", {}, b.token)
check("player can leave", left.status === 200, left)
const gone = await call("/api/mh/sync", {}, b.token)
check("token dies with the player", gone.status === 401 || gone.status === 404, gone)

await call("/api/mh/leave", {}, a.token)
await call("/api/mh/leave", {}, host.token)

console.log(failures === 0 ? "\nAll good." : "\n" + failures + " check(s) failed.")
process.exit(failures === 0 ? 0 : 1)
