/*
    All the server-side game logic for Zonehunt.

    Sections:
    1. Config and small helpers
    2. Geometry
    3. Reading and shaping data
    4. The clock (reveals, game end)
    5. Route handlers
    6. Cron

    Why this is one big module and not inline in the routes:
    PocketBase runs each handler in its own JS runtime, so handlers can't see
    variables from the file they were registered in. The route files just do
    require() on this module and call into it.

    Naming notes:
    "Reveal" = a snapshot of runner positions released to the chasers' map.
    "Fix" = one GPS reading from a phone.
    "Seen" = the last time the server heard from a phone, fix or not.

    -- Elias, 2026
*/

// Config and small helpers

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no 0/O/1/I, people read these out loud
const RETENTION_MS = 5 * 60 * 1000 // ended games are wiped after this
const IDLE_END_MS = 30 * 60 * 1000 // nobody pinged for this long -> game is abandoned
const LOBBY_MAX_AGE_MS = 12 * 60 * 60 * 1000
const FIX_MAX_AGE_MS = 90 * 1000 // older than this and a position doesn't count for compass/catch
const SCAN_COOLDOWN_MS = 3 * 60 * 1000
const STEALTH_MS = 45 * 1000
const STEALTH_COOLDOWN_MS = 4 * 60 * 1000
const KEEP_REVEALS = 20

const DEFAULTS = {
  duration_s: 30 * 60,
  reveal_interval_s: 60,
  head_start_s: 60,
  catch_radius_m: 100,
  compass_range_m: 400,
  max_players: 20,
  powerups: true,
}

const LIMITS = {
  duration_s: [60, 4 * 3600],
  reveal_interval_s: [10, 600],
  head_start_s: [0, 900],
  catch_radius_m: [0, 500], // 0 turns the proximity check off
  compass_range_m: [100, 2000],
  max_players: [2, 20],
}

// PocketBase rewrites plain values in ApiError data, so the machine-readable
// reason has to travel as a ValidationError. Clients read data.reason.code.
function fail(status, reason, message) {
  throw new ApiError(status, message, { reason: new ValidationError(reason, message) })
}

function body(e) {
  const info = e.requestInfo()
  return (info && info.body) || {}
}

function cleanName(raw) {
  const s = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()
  if (s.length < 1) fail(400, "name_missing", "Pick a name first.")
  return s.slice(0, 20)
}

function clampNum(v, key) {
  const lim = LIMITS[key]
  let n = Number(v)
  if (!isFinite(n)) n = DEFAULTS[key]
  return Math.min(lim[1], Math.max(lim[0], Math.round(n)))
}

// JSON fields come back from the Go side in different shapes depending on version,
// so be forgiving here instead of trusting get() blindly.
function jsonField(rec, name) {
  const v = rec.get(name)
  if (v == null) return null
  if (typeof v === "string") {
    try { return JSON.parse(v) } catch (_) { return null }
  }
  if (Array.isArray(v) && typeof v[0] === "number") {
    try { return JSON.parse(toString(v)) } catch (_) { return null }
  }
  if (typeof v === "object" && v.length === 0) return null
  try { return JSON.parse(JSON.stringify(v)) } catch (_) { return null }
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

// Geometry

function toRad(d) { return d * Math.PI / 180 }

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Compass bearing from point 1 to point 2, 0-360 clockwise from north.
function bearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function validLatLng(lat, lng) {
  return typeof lat === "number" && typeof lng === "number" &&
    isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

// Returns a cleaned zone or throws. Circle: {type, lat, lng, radius}. Polygon: {type, points: [[lat,lng],...]}.
function validateZone(z) {
  if (!z || typeof z !== "object") fail(400, "zone_invalid", "The play zone is missing.")
  if (z.type === "circle") {
    const radius = Number(z.radius)
    if (!validLatLng(Number(z.lat), Number(z.lng))) fail(400, "zone_invalid", "The zone center is not a valid location.")
    if (!isFinite(radius) || radius < 50 || radius > 5000) fail(400, "zone_invalid", "The zone radius must be between 50 m and 5 km.")
    return { type: "circle", lat: Number(z.lat), lng: Number(z.lng), radius: Math.round(radius) }
  }
  if (z.type === "polygon") {
    const pts = Array.isArray(z.points) ? z.points : []
    if (pts.length < 3 || pts.length > 40) fail(400, "zone_invalid", "A zone needs 3 to 40 corners.")
    const clean = []
    for (let i = 0; i < pts.length; i++) {
      const lat = Number(pts[i][0]); const lng = Number(pts[i][1])
      if (!validLatLng(lat, lng)) fail(400, "zone_invalid", "One of the corners is not a valid location.")
      clean.push([lat, lng])
    }
    // Keep zones human-sized. Anything wider than ~10 km is a typo or a prank.
    for (let i = 1; i < clean.length; i++) {
      if (haversine(clean[0][0], clean[0][1], clean[i][0], clean[i][1]) > 10000) {
        fail(400, "zone_invalid", "That zone is too big. Keep it under 10 km across.")
      }
    }
    return { type: "polygon", points: clean }
  }
  fail(400, "zone_invalid", "Unknown zone shape.")
}

function insideZone(zone, lat, lng) {
  if (!zone) return true
  if (zone.type === "circle") return haversine(zone.lat, zone.lng, lat, lng) <= zone.radius
  if (zone.type === "polygon") {
    // Ray casting. Fine at game scale, we're not doing continental maps here.
    let inside = false
    const pts = zone.points
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i][0], xi = pts[i][1], yj = pts[j][0], xj = pts[j][1]
      const hit = ((xi > lng) !== (xj > lng)) && (lat < (yj - yi) * (lng - xi) / (xj - xi) + yi)
      if (hit) inside = !inside
    }
    return inside
  }
  return true
}

// Reading and shaping data

function loadGame(id) {
  try { return $app.findRecordById("games", id) } catch (_) { fail(404, "game_gone", "That game doesn't exist anymore.") }
}

function listPlayers(app, gameId) {
  return app.findRecordsByFilter("players", "game = {:g}", "created", 100, 0, { g: gameId })
}

function positionsByPlayer(app, gameId) {
  const map = {}
  const rows = app.findRecordsByFilter("positions", "game = {:g}", "", 200, 0, { g: gameId })
  for (let i = 0; i < rows.length; i++) map[rows[i].getString("player")] = rows[i]
  return map
}

function publicGame(g) {
  return {
    id: g.id,
    code: g.getString("code"),
    host: g.getString("host"),
    status: g.getString("status"),
    winner: g.getString("winner"),
    zone: jsonField(g, "zone"),
    duration_s: g.getFloat("duration_s"),
    reveal_interval_s: g.getFloat("reveal_interval_s"),
    head_start_s: g.getFloat("head_start_s"),
    catch_radius_m: g.getFloat("catch_radius_m"),
    compass_range_m: g.getFloat("compass_range_m"),
    max_players: g.getFloat("max_players"),
    powerups: g.getBool("powerups"),
    started_at: g.getFloat("started_at"),
    chase_starts_at: g.getFloat("chase_starts_at"),
    ends_at: g.getFloat("ends_at"),
    paused_at: g.getFloat("paused_at"),
    next_reveal_at: g.getFloat("next_reveal_at"),
    ended_at: g.getFloat("ended_at"),
    reveal_seq: g.getFloat("reveal_seq"),
  }
}

function publicPlayer(p, pos) {
  return {
    id: p.id,
    name: p.getString("name"),
    role: p.getString("role"),
    status: p.getString("status"),
    ready: p.getBool("ready"),
    seen: pos ? pos.getFloat("seen") : 0,
  }
}

function addEvent(app, gameId, kind, text) {
  const rec = new Record(app.findCollectionByNameOrId("events"))
  rec.set("game", gameId)
  rec.set("at", Date.now())
  rec.set("kind", kind)
  rec.set("text", text)
  app.save(rec)
}

function newSession(player, game) {
  return {
    token: player.newAuthToken(),
    player: { id: player.id, name: player.getString("name") },
    game: publicGame(game),
  }
}

function createPlayer(app, gameId, name, role) {
  const rec = new Record(app.findCollectionByNameOrId("players"))
  rec.set("email", $security.randomStringWithAlphabet(14, "abcdefghijklmnopqrstuvwxyz0123456789") + "@players.zonehunt.invalid")
  rec.setPassword($security.randomString(40))
  rec.set("name", name)
  rec.set("game", gameId)
  rec.set("role", role)
  rec.set("status", "free")
  rec.set("ready", false)
  rec.set("catch_fails", 0)
  rec.set("catch_lock_until", 0)
  rec.set("stealth_until", 0)
  rec.set("stealth_ready_at", 0)
  rec.set("scan_ready_at", 0)
  app.save(rec)
  return rec
}

function requireHost(game, me) {
  if (game.getString("host") !== me.id) fail(403, "not_host", "Only the host can do that.")
}

function requireStatus(game, allowed, message) {
  if (allowed.indexOf(game.getString("status")) === -1) fail(409, "wrong_state", message)
}

// The clock

function endGame(app, game, winner, text) {
  game.set("status", "ended")
  game.set("winner", winner)
  game.set("ended_at", Date.now())
  app.save(game)
  addEvent(app, game.id, "end", text)
}

// Takes a snapshot of every free, non-hidden runner who has a fix and stores it for chasers.
function createReveal(app, game, kind, t) {
  const runners = app.findRecordsByFilter("players", "game = {:g} && role = 'runner' && status = 'free'", "created", 100, 0, { g: game.id })
  const positions = positionsByPlayer(app, game.id)
  const points = []
  for (let i = 0; i < runners.length; i++) {
    const r = runners[i]
    if (r.getFloat("stealth_until") > t) continue
    const pos = positions[r.id]
    if (!pos || pos.getFloat("ts") <= 0) continue
    points.push({
      id: r.id,
      name: r.getString("name"),
      lat: pos.getFloat("lat"),
      lng: pos.getFloat("lng"),
      acc: pos.getFloat("acc"),
      t: pos.getFloat("ts"),
    })
  }
  const seq = game.getFloat("reveal_seq") + 1
  const rec = new Record(app.findCollectionByNameOrId("reveals"))
  rec.set("game", game.id)
  rec.set("seq", seq)
  rec.set("at", t)
  rec.set("kind", kind)
  rec.set("points", points)
  app.save(rec)
  game.set("reveal_seq", seq)

  // Old reveals are just clutter, chasers only ever need the latest.
  try {
    const old = app.findRecordsByFilter("reveals", "game = {:g} && seq <= {:s}", "", 100, 0, { g: game.id, s: seq - KEEP_REVEALS })
    for (let i = 0; i < old.length; i++) app.delete(old[i])
  } catch (_) {}
}

function noRunnersLeft(app, gameId) {
  const left = app.findRecordsByFilter("players", "game = {:g} && role = 'runner' && status = 'free'", "", 1, 0, { g: gameId })
  return left.length === 0
}

// Moves the game forward if something is due: time ran out, everyone got caught,
// or it's reveal time. Cheap check first so most syncs never open a transaction.
function tickIfDue(game, t) {
  if (game.getString("status") !== "active") return game
  const due = t >= game.getFloat("ends_at") ||
    (t >= game.getFloat("chase_starts_at") && t >= game.getFloat("next_reveal_at"))
  if (!due) return game

  let fresh = game
  $app.runInTransaction((tx) => {
    // Re-read inside the transaction. Two phones can tick at the same moment and
    // we don't want a double reveal.
    const g = tx.findRecordById("games", game.id)
    fresh = g
    if (g.getString("status") !== "active") return
    if (t >= g.getFloat("ends_at")) {
      endGame(tx, g, "runners", "Time's up. The runners got away.")
      return
    }
    if (t >= g.getFloat("chase_starts_at") && t >= g.getFloat("next_reveal_at")) {
      createReveal(tx, g, "timed", t)
      const step = g.getFloat("reveal_interval_s") * 1000
      let next = g.getFloat("next_reveal_at")
      while (next <= t) next += step
      g.set("next_reveal_at", next)
      tx.save(g)
    }
  })
  return fresh
}

// Route handlers

function createGame(e) {
  const b = body(e)
  const name = cleanName(b.name)
  const cfg = {}
  for (const key in LIMITS) cfg[key] = clampNum(b[key] == null ? DEFAULTS[key] : b[key], key)
  cfg.powerups = b.powerups == null ? DEFAULTS.powerups : !!b.powerups

  let session = null
  $app.runInTransaction((tx) => {
    const col = tx.findCollectionByNameOrId("games")
    let game = null
    for (let attempt = 0; attempt < 8 && !game; attempt++) {
      const code = $security.randomStringWithAlphabet(6, CODE_ALPHABET)
      try {
        tx.findFirstRecordByFilter("games", "code = {:c}", { c: code })
      } catch (_) {
        game = new Record(col)
        game.set("code", code)
      }
    }
    if (!game) fail(500, "code_failed", "Couldn't make a join code. Try again.")
    game.set("status", "lobby")
    game.set("host", "")
    for (const key in cfg) game.set(key, cfg[key])
    if (b.zone) game.set("zone", validateZone(b.zone))
    game.set("reveal_seq", 0)
    tx.save(game)
    const host = createPlayer(tx, game.id, name, "none")
    host.set("ready", true)
    tx.save(host)
    game.set("host", host.id)
    tx.save(game)
    session = newSession(host, game)
  })
  return e.json(200, session)
}

function joinGame(e) {
  const b = body(e)
  const name = cleanName(b.name)
  const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  let session = null
  $app.runInTransaction((tx) => {
    let game = null
    try { game = tx.findFirstRecordByFilter("games", "code = {:c}", { c: code }) } catch (_) {}
    if (!game) fail(404, "code_unknown", "No game with that code.")
    if (game.getString("status") !== "lobby") fail(409, "already_started", "That game has already started.")
    const players = listPlayers(tx, game.id)
    if (players.length >= game.getFloat("max_players")) fail(409, "game_full", "That game is full.")
    for (let i = 0; i < players.length; i++) {
      if (players[i].getString("name").toLowerCase() === name.toLowerCase()) {
        fail(409, "name_taken", "Someone in that game already uses that name.")
      }
    }
    const me = createPlayer(tx, game.id, name, "none")
    addEvent(tx, game.id, "join", name + " joined.")
    session = newSession(me, game)
  })
  return e.json(200, session)
}

function configGame(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireHost(game, me)
  requireStatus(game, ["lobby"], "You can only change the setup in the lobby.")
  const b = body(e)
  for (const key in LIMITS) {
    if (b[key] != null) game.set(key, clampNum(b[key], key))
  }
  if (b.powerups != null) game.set("powerups", !!b.powerups)
  if (b.zone === null) game.set("zone", null)
  else if (b.zone) game.set("zone", validateZone(b.zone))
  $app.save(game)
  return e.json(200, { game: publicGame(game) })
}

function setRole(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireStatus(game, ["lobby"], "Roles are locked once the game starts.")
  const b = body(e)
  const role = String(b.role || "")
  if (["none", "chaser", "runner", "referee"].indexOf(role) === -1) fail(400, "role_invalid", "Unknown role.")
  const targetId = b.player ? String(b.player) : me.id
  if (targetId !== me.id) requireHost(game, me)
  let target = null
  try { target = $app.findRecordById("players", targetId) } catch (_) {}
  if (!target || target.getString("game") !== game.id) fail(404, "player_unknown", "That player isn't in this game.")
  target.set("role", role)
  $app.save(target)
  return e.json(200, { ok: true })
}

// Host helper: splits everyone (except referees) into chasers and runners at random.
function randomize(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireHost(game, me)
  requireStatus(game, ["lobby"], "Roles are locked once the game starts.")
  const b = body(e)
  const players = listPlayers($app, game.id).filter((p) => p.getString("role") !== "referee")
  if (players.length < 2) fail(409, "not_enough_players", "You need at least two players to split into teams.")
  const wanted = Math.round(Number(b.chasers))
  const chasers = Math.min(players.length - 1, Math.max(1, isFinite(wanted) ? wanted : Math.ceil(players.length / 3)))
  const order = shuffle(players)
  $app.runInTransaction((tx) => {
    for (let i = 0; i < order.length; i++) {
      const p = tx.findRecordById("players", order[i].id)
      p.set("role", i < chasers ? "chaser" : "runner")
      tx.save(p)
    }
  })
  return e.json(200, { ok: true })
}

function setReady(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireStatus(game, ["lobby"], "The game already started.")
  me.set("ready", !!body(e).ready)
  $app.save(me)
  return e.json(200, { ok: true })
}

function startGame(e) {
  const me = e.auth
  let game = loadGame(me.getString("game"))
  requireHost(game, me)
  requireStatus(game, ["lobby"], "This game already started.")
  if (!jsonField(game, "zone")) fail(409, "zone_missing", "Draw the play zone first.")

  $app.runInTransaction((tx) => {
    game = tx.findRecordById("games", game.id)
    if (game.getString("status") !== "lobby") fail(409, "wrong_state", "This game already started.")
    const players = listPlayers(tx, game.id)
    let chasers = 0, runners = 0
    for (let i = 0; i < players.length; i++) {
      const role = players[i].getString("role")
      if (role === "none") fail(409, "roles_missing", players[i].getString("name") + " still needs a role.")
      if (role === "chaser") chasers++
      if (role === "runner") runners++
      if (!players[i].getBool("ready") && players[i].id !== me.id) fail(409, "not_ready", players[i].getString("name") + " isn't ready yet.")
    }
    if (chasers < 1 || runners < 1) fail(409, "teams_invalid", "You need at least one chaser and one runner.")

    const t = Date.now()
    const used = {}
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      p.set("status", "free")
      p.set("catch_fails", 0)
      p.set("catch_lock_until", 0)
      p.set("stealth_until", 0)
      p.set("stealth_ready_at", 0)
      p.set("scan_ready_at", 0)
      if (p.getString("role") === "runner") {
        let code = ""
        do { code = $security.randomStringWithAlphabet(4, "0123456789") } while (used[code])
        used[code] = true
        p.set("catch_code", code)
      } else {
        p.set("catch_code", "")
      }
      tx.save(p)
    }
    const head = game.getFloat("head_start_s") * 1000
    game.set("status", "active")
    game.set("started_at", t)
    game.set("chase_starts_at", t + head)
    game.set("next_reveal_at", t + head)
    game.set("ends_at", t + game.getFloat("duration_s") * 1000)
    game.set("paused_at", 0)
    game.set("reveal_seq", 0)
    tx.save(game)
    addEvent(tx, game.id, "start", head > 0 ? "Game on. Runners get a head start." : "Game on.")
  })
  return e.json(200, { game: publicGame(game) })
}

/*
    The heartbeat. Phones call this every few seconds with their latest GPS fix
    and get back everything they need to draw the screen: game state, roster,
    their own status, the compass (runners), new reveals (chasers) and new feed events.

    Because it returns the full state every time, a phone that was asleep for
    two minutes catches up with one request. Realtime subscriptions only exist
    to make this call happen sooner.
*/
function sync(e) {
  const t = Date.now()
  let me = e.auth
  const b = body(e)
  let game = loadGame(me.getString("game"))

  // Upsert my position record. Outside an active game we only note "seen",
  // no coordinates are stored at all.
  const active = game.getString("status") === "active"
  const lat = Number(b.lat), lng = Number(b.lng)
  const hasFix = b.lat != null && b.lng != null && validLatLng(lat, lng)
  let myPos = null
  try { myPos = $app.findFirstRecordByFilter("positions", "player = {:p}", { p: me.id }) } catch (_) {}
  if (!myPos) {
    myPos = new Record($app.findCollectionByNameOrId("positions"))
    myPos.set("player", me.id)
    myPos.set("game", game.id)
  }
  myPos.set("seen", t)
  if (hasFix && active) {
    const clientTs = Number(b.ts)
    const ts = isFinite(clientTs) && clientTs > t - 120000 && clientTs <= t + 5000 ? clientTs : t
    const acc = Number(b.acc)
    myPos.set("lat", lat)
    myPos.set("lng", lng)
    myPos.set("acc", isFinite(acc) ? Math.min(Math.max(acc, 0), 10000) : 0)
    myPos.set("ts", ts)
  }
  $app.save(myPos)

  game = tickIfDue(game, t)
  const status = game.getString("status")
  const zone = jsonField(game, "zone")
  const players = listPlayers($app, game.id)
  const positions = positionsByPlayer($app, game.id)
  const role = me.getString("role")

  // Out-of-zone flag. Only meaningful with a fresh fix.
  let outside = null
  if (status === "active" && myPos.getFloat("ts") > t - FIX_MAX_AGE_MS) {
    outside = !insideZone(zone, myPos.getFloat("lat"), myPos.getFloat("lng"))
  }

  // Runner compass: nearest chaser, distance rounded so it can't be used to triangulate.
  let compass = null
  if (status === "active" && role === "runner" && me.getString("status") === "free") {
    if (myPos.getFloat("ts") > t - FIX_MAX_AGE_MS) {
      const range = game.getFloat("compass_range_m")
      let best = null, count = 0
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        if (p.getString("role") !== "chaser") continue
        const pos = positions[p.id]
        if (!pos || pos.getFloat("ts") < t - FIX_MAX_AGE_MS) continue
        const d = haversine(myPos.getFloat("lat"), myPos.getFloat("lng"), pos.getFloat("lat"), pos.getFloat("lng"))
        if (d > range) continue
        count++
        if (!best || d < best.d) best = { d: d, lat: pos.getFloat("lat"), lng: pos.getFloat("lng") }
      }
      if (best) {
        const rounded = best.d < 100 ? Math.round(best.d / 10) * 10 : Math.round(best.d / 25) * 25
        compass = {
          bearing: Math.round(bearing(myPos.getFloat("lat"), myPos.getFloat("lng"), best.lat, best.lng)),
          distance: rounded,
          count: count,
        }
      }
    }
  }

  // New reveal, only for people allowed to see runners.
  let reveal = null
  const seesRunners = role === "chaser" || role === "referee" || me.getString("status") === "caught"
  if (seesRunners && game.getFloat("reveal_seq") > 0) {
    const have = Number(b.reveal_seq) || 0
    const rows = $app.findRecordsByFilter("reveals", "game = {:g} && seq > {:s}", "-seq", 1, 0, { g: game.id, s: have })
    if (rows.length) {
      reveal = {
        seq: rows[0].getFloat("seq"),
        at: rows[0].getFloat("at"),
        kind: rows[0].getString("kind"),
        points: jsonField(rows[0], "points") || [],
      }
    }
  }

  // Referees get the live view of everyone.
  let live = null
  if (role === "referee" && status === "active") {
    live = []
    for (let i = 0; i < players.length; i++) {
      const pos = positions[players[i].id]
      if (pos && pos.getFloat("ts") > 0) {
        live.push({ id: players[i].id, lat: pos.getFloat("lat"), lng: pos.getFloat("lng"), acc: pos.getFloat("acc"), t: pos.getFloat("ts") })
      }
    }
  }

  const since = Number(b.event_at) || 0
  const eventRows = $app.findRecordsByFilter("events", "game = {:g} && at > {:a}", "at", 60, 0, { g: game.id, a: since })

  return e.json(200, {
    now: t,
    game: publicGame(game),
    me: {
      id: me.id,
      role: role,
      status: me.getString("status"),
      ready: me.getBool("ready"),
      catch_code: role === "runner" ? me.getString("catch_code") : "",
      catch_lock_until: me.getFloat("catch_lock_until"),
      stealth_until: me.getFloat("stealth_until"),
      stealth_ready_at: me.getFloat("stealth_ready_at"),
      scan_ready_at: me.getFloat("scan_ready_at"),
      outside: outside,
      has_fix: hasFix,
    },
    players: players.map((p) => publicPlayer(p, positions[p.id])),
    compass: compass,
    reveal: reveal,
    live: live,
    events: eventRows.map((r) => ({ id: r.id, at: r.getFloat("at"), kind: r.getString("kind"), text: r.getString("text") })),
  })
}

function catchRunner(e) {
  const t = Date.now()
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireStatus(game, ["active"], "The game isn't running.")
  if (me.getString("role") !== "chaser") fail(403, "not_chaser", "Only chasers can record catches.")
  if (t < game.getFloat("chase_starts_at")) fail(409, "head_start", "The runners still have their head start.")
  if (t >= game.getFloat("ends_at")) fail(409, "time_up", "Time is up.")
  if (me.getFloat("catch_lock_until") > t) fail(429, "locked", "Too many wrong codes. Wait a few seconds.")

  const code = String(body(e).code || "").replace(/\D/g, "")
  let runner = null
  if (code.length === 4) {
    try {
      runner = $app.findFirstRecordByFilter("players", "game = {:g} && role = 'runner' && status = 'free' && catch_code = {:c}", { g: game.id, c: code })
    } catch (_) {}
  }
  if (!runner) {
    const fails = me.getFloat("catch_fails") + 1
    me.set("catch_fails", fails >= 5 ? 0 : fails)
    if (fails >= 5) me.set("catch_lock_until", t + 30000)
    $app.save(me)
    fail(404, "code_wrong", "That code doesn't match any runner.")
  }

  // Proximity: the code already implies you're standing next to them, but a
  // screenshot of a code shouldn't win a game. Skipped when the host set it to 0.
  const radius = game.getFloat("catch_radius_m")
  if (radius > 0) {
    const positions = positionsByPlayer($app, game.id)
    const a = positions[me.id], r = positions[runner.id]
    const fresh = (p) => p && p.getFloat("ts") > t - FIX_MAX_AGE_MS
    if (!fresh(a) || !fresh(r)) fail(409, "no_fix", "Waiting for a fresh GPS fix from both of you. Try again in a few seconds.")
    const slack = Math.min(a.getFloat("acc"), 60) + Math.min(r.getFloat("acc"), 60)
    const d = haversine(a.getFloat("lat"), a.getFloat("lng"), r.getFloat("lat"), r.getFloat("lng"))
    if (d > radius + slack) fail(409, "too_far", "You're too far from that runner for a catch (" + Math.round(d) + " m).")
  }

  let remaining = 0
  $app.runInTransaction((tx) => {
    const target = tx.findRecordById("players", runner.id)
    if (target.getString("status") !== "free") fail(409, "already_caught", "That runner was already caught.")
    target.set("status", "caught")
    tx.save(target)
    const chaser = tx.findRecordById("players", me.id)
    chaser.set("catch_fails", 0)
    tx.save(chaser)
    addEvent(tx, game.id, "catch", target.getString("name") + " was caught by " + me.getString("name") + ".")
    const g = tx.findRecordById("games", game.id)
    if (noRunnersLeft(tx, g.id)) endGame(tx, g, "chasers", "Every runner is caught. Chasers win.")
    remaining = tx.findRecordsByFilter("players", "game = {:g} && role = 'runner' && status = 'free'", "", 100, 0, { g: g.id }).length
  })
  return e.json(200, { ok: true, caught: { id: runner.id, name: runner.getString("name") }, remaining: remaining })
}

function usePowerup(e) {
  const t = Date.now()
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireStatus(game, ["active"], "The game isn't running.")
  if (!game.getBool("powerups")) fail(409, "powerups_off", "Power-ups are off in this game.")
  const type = String(body(e).type || "")

  if (type === "scan") {
    if (me.getString("role") !== "chaser") fail(403, "wrong_role", "Only chasers can scan.")
    if (t < game.getFloat("chase_starts_at")) fail(409, "head_start", "The runners still have their head start.")
    if (me.getFloat("scan_ready_at") > t) fail(409, "cooldown", "Scan is still recharging.")
    $app.runInTransaction((tx) => {
      const g = tx.findRecordById("games", game.id)
      createReveal(tx, g, "scan", t)
      tx.save(g)
      const p = tx.findRecordById("players", me.id)
      p.set("scan_ready_at", t + SCAN_COOLDOWN_MS)
      tx.save(p)
      addEvent(tx, g.id, "powerup", me.getString("name") + " used Scan. Runners are on the chasers' map.")
    })
    return e.json(200, { ok: true })
  }

  if (type === "stealth") {
    if (me.getString("role") !== "runner" || me.getString("status") !== "free") fail(403, "wrong_role", "Only runners still in the game can hide.")
    if (me.getFloat("stealth_ready_at") > t) fail(409, "cooldown", "Stealth is still recharging.")
    me.set("stealth_until", t + STEALTH_MS)
    me.set("stealth_ready_at", t + STEALTH_COOLDOWN_MS)
    $app.save(me)
    addEvent($app, game.id, "powerup", "A runner went dark.")
    return e.json(200, { ok: true })
  }

  fail(400, "powerup_unknown", "Unknown power-up.")
}

// Any player can pause (someone's hurt, someone's lost). Only the host resumes.
function pause(e) {
  const t = Date.now()
  const me = e.auth
  const wantPaused = !!body(e).paused
  let game = loadGame(me.getString("game"))
  $app.runInTransaction((tx) => {
    game = tx.findRecordById("games", game.id)
    const status = game.getString("status")
    if (wantPaused) {
      if (status !== "active") fail(409, "wrong_state", "The game isn't running.")
      game.set("status", "paused")
      game.set("paused_at", t)
      tx.save(game)
      addEvent(tx, game.id, "pause", me.getString("name") + " paused the game.")
    } else {
      if (status !== "paused") fail(409, "wrong_state", "The game isn't paused.")
      requireHost(game, me)
      // Shift every deadline by the time we sat paused, otherwise a long pause eats the game.
      const gap = t - game.getFloat("paused_at")
      game.set("ends_at", game.getFloat("ends_at") + gap)
      game.set("chase_starts_at", game.getFloat("chase_starts_at") + gap)
      game.set("next_reveal_at", game.getFloat("next_reveal_at") + gap)
      game.set("paused_at", 0)
      game.set("status", "active")
      tx.save(game)
      addEvent(tx, game.id, "resume", "Game resumed.")
    }
  })
  return e.json(200, { game: publicGame(game) })
}

function endEarly(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  requireHost(game, me)
  requireStatus(game, ["active", "paused"], "The game isn't running.")
  endGame($app, game, "none", "The host ended the game.")
  return e.json(200, { game: publicGame(game) })
}

// Leave (or, as host, kick someone). The last person out turns off the lights.
function leave(e) {
  const me = e.auth
  const game = loadGame(me.getString("game"))
  const b = body(e)
  let target = me
  if (b.player && b.player !== me.id) {
    requireHost(game, me)
    try { target = $app.findRecordById("players", String(b.player)) } catch (_) { fail(404, "player_unknown", "That player isn't in this game.") }
    if (target.getString("game") !== game.id) fail(404, "player_unknown", "That player isn't in this game.")
  }
  const name = target.getString("name")
  const wasHost = game.getString("host") === target.id

  $app.runInTransaction((tx) => {
    tx.delete(tx.findRecordById("players", target.id))
    const rest = listPlayers(tx, game.id)
    if (rest.length === 0) {
      tx.delete(tx.findRecordById("games", game.id))
      return
    }
    const g = tx.findRecordById("games", game.id)
    if (wasHost) g.set("host", rest[0].id)
    tx.save(g)
    if (g.getString("status") !== "ended") {
      addEvent(tx, g.id, "leave", name + (target.id === me.id ? " left." : " was removed."))
      if (g.getString("status") === "active" && noRunnersLeft(tx, g.id)) {
        endGame(tx, g, "chasers", "No runners left. Chasers win.")
      }
    }
  })
  return e.json(200, { ok: true })
}

// Cron

// Runs every minute. Covers the case where nobody is pinging (everyone's phone is asleep)
// and handles cleanup: ended games are deleted 5 minutes after the final whistle.
function cron() {
  const t = Date.now()
  const games = $app.findRecordsByFilter("games", "id != ''", "", 500, 0)
  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    try {
      const status = g.getString("status")
      if (status === "ended") {
        if (t - g.getFloat("ended_at") > RETENTION_MS) $app.delete(g)
        continue
      }
      if (status === "lobby") {
        const created = new Date(String(g.get("created"))).getTime()
        if (isFinite(created) && t - created > LOBBY_MAX_AGE_MS) $app.delete(g)
        continue
      }
      let newest = 0
      try {
        const rows = $app.findRecordsByFilter("positions", "game = {:g}", "-seen", 1, 0, { g: g.id })
        if (rows.length) newest = rows[0].getFloat("seen")
      } catch (_) {}
      if (t - newest > IDLE_END_MS && t - Math.max(g.getFloat("started_at"), g.getFloat("paused_at")) > IDLE_END_MS) {
        endGame($app, g, "none", "Nobody was connected for a while, so the game was closed.")
        continue
      }
      if (status === "active") tickIfDue(g, t)
    } catch (err) {
      console.log("zonehunt cron skipped a game: " + err)
    }
  }
}

module.exports = {
  createGame, joinGame, configGame, setRole, randomize, setReady, startGame,
  sync, catchRunner, usePowerup, pause, endEarly, leave, cron,
}
