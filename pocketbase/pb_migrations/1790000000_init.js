/*
    Schema for Zonehunt.

    Collections:
    1. games     - one row per lobby/match, holds the config and the clock
    2. players   - auth collection, one throwaway account per person per game
    3. positions - latest GPS fix per player. Nobody can read this from the client.
    4. reveals   - snapshots of runner positions that chasers are allowed to see
    5. events    - the little game feed ("Mia was caught")

    The golden rule: clients never write to any of these directly. Every change
    goes through the /api/mh/* routes in pb_hooks, which is where the rules live.

    -- Elias, 2026
*/

migrate((app) => {
  // Games
  // Rules are added at the very end, because they point at the players collection
  // and that doesn't exist yet.
  const games = new Collection({
    type: "base",
    name: "games",
    fields: [
      { type: "text", name: "code", required: true, min: 6, max: 6 },
      { type: "text", name: "host" },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["lobby", "active", "paused", "ended"] },
      { type: "select", name: "winner", maxSelect: 1, values: ["chasers", "runners", "none"] },
      { type: "json", name: "zone", maxSize: 200000 },
      { type: "number", name: "duration_s" },
      { type: "number", name: "reveal_interval_s" },
      { type: "number", name: "head_start_s" },
      { type: "number", name: "catch_radius_m" },
      { type: "number", name: "compass_range_m" },
      { type: "number", name: "max_players" },
      { type: "bool", name: "powerups" },
      { type: "number", name: "started_at" },
      { type: "number", name: "chase_starts_at" },
      { type: "number", name: "ends_at" },
      { type: "number", name: "paused_at" },
      { type: "number", name: "next_reveal_at" },
      { type: "number", name: "ended_at" },
      { type: "number", name: "reveal_seq" },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_games_code ON games (code)"],
  })
  app.save(games)

  // Players
  // Random email + random password: nobody ever logs in with these. The token comes
  // straight from the join route. Email is only here because auth collections want one.
  const players = new Collection({
    type: "auth",
    name: "players",
    fields: [
      { type: "text", name: "name", required: true, max: 24 },
      { type: "relation", name: "game", required: true, maxSelect: 1, collectionId: games.id, cascadeDelete: true },
      { type: "select", name: "role", required: true, maxSelect: 1, values: ["none", "chaser", "runner", "referee"] },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["free", "caught"] },
      { type: "bool", name: "ready" },
      { type: "text", name: "catch_code", hidden: true },
      { type: "number", name: "catch_fails", hidden: true },
      { type: "number", name: "catch_lock_until", hidden: true },
      { type: "number", name: "stealth_until" },
      { type: "number", name: "stealth_ready_at" },
      { type: "number", name: "scan_ready_at" },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_players_game ON players (game)"],
    passwordAuth: { enabled: true, identityFields: ["email"] },
    authAlert: { enabled: false },
  })
  app.save(players)

  // Positions
  const positions = new Collection({
    type: "base",
    name: "positions",
    fields: [
      { type: "relation", name: "player", required: true, maxSelect: 1, collectionId: players.id, cascadeDelete: true },
      { type: "relation", name: "game", required: true, maxSelect: 1, collectionId: games.id, cascadeDelete: true },
      { type: "number", name: "lat" },
      { type: "number", name: "lng" },
      { type: "number", name: "acc" },
      { type: "number", name: "ts" },
      { type: "number", name: "seen" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_positions_player ON positions (player)",
      "CREATE INDEX idx_positions_game ON positions (game)",
    ],
  })
  app.save(positions)

  // Reveals
  const reveals = new Collection({
    type: "base",
    name: "reveals",
    fields: [
      { type: "relation", name: "game", required: true, maxSelect: 1, collectionId: games.id, cascadeDelete: true },
      { type: "number", name: "seq" },
      { type: "number", name: "at" },
      { type: "select", name: "kind", maxSelect: 1, values: ["timed", "scan"] },
      { type: "json", name: "points", maxSize: 200000 },
    ],
    indexes: ["CREATE INDEX idx_reveals_game ON reveals (game, seq)"],
  })
  app.save(reveals)

  // Events
  const events = new Collection({
    type: "base",
    name: "events",
    fields: [
      { type: "relation", name: "game", required: true, maxSelect: 1, collectionId: games.id, cascadeDelete: true },
      { type: "number", name: "at" },
      { type: "text", name: "kind" },
      { type: "text", name: "text", max: 200 },
    ],
    indexes: ["CREATE INDEX idx_events_game ON events (game, at)"],
  })
  app.save(events)

  // Rules
  // The realtime stream is only a "something changed, go sync" nudge for the client,
  // the real data always comes back from /api/mh/sync. Still, these rules need to be
  // right, because anyone with a token can subscribe.
  const member = '@request.auth.collectionName = "players" && @request.auth.game = '

  const g = app.findCollectionByNameOrId("games")
  g.listRule = member + "id"
  g.viewRule = member + "id"
  app.save(g)

  const p = app.findCollectionByNameOrId("players")
  p.listRule = member + "game"
  p.viewRule = member + "game"
  app.save(p)

  const r = app.findCollectionByNameOrId("reveals")
  const seesReveals = member + 'game && (@request.auth.role = "chaser" || @request.auth.role = "referee" || @request.auth.status = "caught")'
  r.listRule = seesReveals
  r.viewRule = seesReveals
  app.save(r)

  const ev = app.findCollectionByNameOrId("events")
  ev.listRule = member + "game"
  ev.viewRule = member + "game"
  app.save(ev)

  // Rate limits
  // Mostly to make guessing join codes boring. Heads up: behind Cloudflare Tunnel
  // every request looks like it's from one IP unless you set the trusted proxy
  // header (CF-Connecting-IP) in PocketBase settings. See the README.
  try {
    const settings = app.settings()
    settings.rateLimits.enabled = true
    settings.rateLimits.rules = [
      { label: "/api/mh/join", maxRequests: 15, duration: 60 },
      { label: "/api/mh/games", maxRequests: 10, duration: 60 },
    ]
    app.save(settings)
  } catch (err) {
    console.log("could not set rate limits, set them in the admin UI instead: " + err)
  }
}, (app) => {
  for (const name of ["events", "reveals", "positions", "players", "games"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
})
