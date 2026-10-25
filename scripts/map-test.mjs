// Checks that the map stays where the player put it while game updates keep arriving.
// Sets a game up through the API, opens it in a desktop-size browser, zooms and drags the map,
// waits through several syncs and GPS heartbeats, and compares screenshots of the map.
// Usage: node scripts/map-test.mjs [http://127.0.0.1:8090] [screenshot-dir]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8090";
const SHOTS = process.argv[3] || ".";
let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log("  ok   " + name);
  else { failures++; console.log("  FAIL " + name + (extra ? " -> " + extra : "")); }
};

async function call(path, body, token) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

const C = { latitude: 56.0465, longitude: 12.6945 };

// A game with one chaser and one runner, already running.
const host = await call("/api/mh/games", { name: "Host", head_start_s: 0, duration_s: 1800, reveal_interval_s: 15 });
const runner = await call("/api/mh/join", { code: host.game.code, name: "Rue" });
await call("/api/mh/config", { zone: { type: "circle", lat: C.latitude, lng: C.longitude, radius: 600 } }, host.token);
await call("/api/mh/role", { role: "chaser" }, host.token);
await call("/api/mh/role", { role: "runner" }, runner.token);
await call("/api/mh/ready", { ready: true }, runner.token);
await call("/api/mh/start", {}, host.token);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 700, height: 900 },
  permissions: ["geolocation"],
  geolocation: { ...C, accuracy: 8 },
  serviceWorkers: "block",
});
const session = { token: runner.token, record: { id: runner.player.id, collectionId: "players", collectionName: "players", game: runner.game.id } };
await ctx.addInitScript((s) => localStorage.setItem("pocketbase_auth", JSON.stringify(s)), session);
const page = await ctx.newPage();
await page.goto(BASE);
await page.getByText("Your catch code").waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);

const map = page.locator(".leaflet-container");
const box = await map.boundingBox();

// The zone outline is the biggest shape on the map, so its box tells us where the view is.
const zoneBox = () =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".leaflet-overlay-pane path")].map((el) => el.getBoundingClientRect());
    boxes.sort((a, b) => b.width * b.height - a.width * a.height);
    const r = boxes[0];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
const same = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.w - b.w) < 2;
const fmt = (o) => JSON.stringify({ x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w) });

// A: zoom with the wheel, close to a corner so the view clearly shifts. No dragging.
await page.mouse.move(box.x + 120, box.y + 120);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(700);
const a1 = await zoneBox();
await page.waitForTimeout(11000); // several syncs and GPS heartbeats
const a2 = await zoneBox();
check("zoom only: view stays put through updates", same(a1, a2), `${fmt(a1)} -> ${fmt(a2)}`);

// B: drag the map somewhere else.
await page.mouse.move(box.x + 300, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + 150, box.y + 380, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(700);
const b1 = await zoneBox();
await page.waitForTimeout(8000);
const b2 = await zoneBox();
check("after a drag: view stays put through updates", same(b1, b2), `${fmt(b1)} -> ${fmt(b2)}`);

// C: the recenter button puts the player back in the middle and follows from then on.
await page.getByRole("button", { name: "Center on me" }).click();
await page.waitForTimeout(900);
const c1 = await zoneBox();
check("recenter moves the view", !same(b2, c1), `${fmt(b2)} -> ${fmt(c1)}`);
await ctx.setGeolocation({ latitude: C.latitude + 0.0022, longitude: C.longitude, accuracy: 8 });
await page.waitForTimeout(6000);
const c2 = await zoneBox();
check("follow resumes after recentering", !same(c1, c2), `${fmt(c1)} -> ${fmt(c2)}`);

// D: no flicker. The player's own dot should not be rebuilt when nothing about it changed.
await page.evaluate(() => {
  window.__redraws = 0;
  const pane = document.querySelector(".leaflet-overlay-pane svg");
  new MutationObserver((m) => (window.__redraws += m.length)).observe(pane, { childList: true, subtree: true });
});
await ctx.setGeolocation({ latitude: C.latitude + 0.0022, longitude: C.longitude, accuracy: 8 });
await page.waitForTimeout(10000);
const redraws = await page.evaluate(() => window.__redraws);
check("player dot is not redrawn while standing still", redraws <= 6, `${redraws} DOM changes in 10 s`);

await browser.close();
await call("/api/mh/leave", {}, runner.token);
await call("/api/mh/leave", {}, host.token);
console.log(failures === 0 ? "\nAll good." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
