// Route table for Zonehunt. The actual logic lives in handlers.js, see the note there.

// Cache headers for the app files. PocketBase sends none, and behind Cloudflare that means
// sw.js and index.html can sit in the edge cache for hours after a deploy, so phones keep
// running the old app. Hashed build files never change, so those can be cached forever.
routerUse((e) => {
  const path = e.request.url.path
  if (e.request.method === "GET" && !path.startsWith("/api/") && !path.startsWith("/_/")) {
    const immutable = path.startsWith("/_next/static/")
    e.response.header().set("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache")
  }
  return e.next()
})

// Anyone can create or join a game. They get a throwaway player account back.
routerAdd("POST", "/api/mh/games", (e) => require(`${__hooks}/handlers.js`).createGame(e))
routerAdd("POST", "/api/mh/join", (e) => require(`${__hooks}/handlers.js`).joinGame(e))

// Everything below needs a player token.
const auth = $apis.requireAuth("players")

routerAdd("POST", "/api/mh/config", (e) => require(`${__hooks}/handlers.js`).configGame(e), auth)
routerAdd("POST", "/api/mh/role", (e) => require(`${__hooks}/handlers.js`).setRole(e), auth)
routerAdd("POST", "/api/mh/randomize", (e) => require(`${__hooks}/handlers.js`).randomize(e), auth)
routerAdd("POST", "/api/mh/ready", (e) => require(`${__hooks}/handlers.js`).setReady(e), auth)
routerAdd("POST", "/api/mh/start", (e) => require(`${__hooks}/handlers.js`).startGame(e), auth)
routerAdd("POST", "/api/mh/sync", (e) => require(`${__hooks}/handlers.js`).sync(e), auth)
routerAdd("POST", "/api/mh/catch", (e) => require(`${__hooks}/handlers.js`).catchRunner(e), auth)
routerAdd("POST", "/api/mh/powerup", (e) => require(`${__hooks}/handlers.js`).usePowerup(e), auth)
routerAdd("POST", "/api/mh/pause", (e) => require(`${__hooks}/handlers.js`).pause(e), auth)
routerAdd("POST", "/api/mh/end", (e) => require(`${__hooks}/handlers.js`).endEarly(e), auth)
routerAdd("POST", "/api/mh/leave", (e) => require(`${__hooks}/handlers.js`).leave(e), auth)

cronAdd("zonehunt-tick", "* * * * *", () => require(`${__hooks}/handlers.js`).cron())
