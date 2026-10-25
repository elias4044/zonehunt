// Drives two real browser "phones" through lobby -> game -> catch against a running server.
// Usage: node scripts/browser-test.mjs [http://127.0.0.1:8090] [screenshot-dir]
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

const C = { latitude: 56.0465, longitude: 12.6945 };
const browser = await chromium.launch();

async function phone(name, offsetLat) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ["geolocation"],
    geolocation: { latitude: C.latitude + offsetLat, longitude: C.longitude, accuracy: 8 },
    serviceWorkers: "block",
  });
  // Records which one-off animations ever appeared, since most of them are over in under two seconds.
  await ctx.addInitScript(() => {
    window.__seen = {};
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const name of ["zh-ping", "zh-splash", "zh-sheet"]) {
          if (n.classList?.contains(name) || n.querySelector?.("." + name)) window.__seen[name] = true;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push((e.stack || String(e)).split("\n").slice(0, 6).join(" | ")));
  page.on("console", (m) => { if (m.type() === "error" && !/tile\.openstreetmap|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE);
  return { name, ctx, page, errors };
}

const host = await phone("Hosty", 0);
const runner = await phone("Rue", 0.0003);

console.log("home");
await host.page.screenshot({ path: `${SHOTS}/01-home.png` });
await host.page.getByLabel("Your name").fill("Hosty");
await host.page.getByRole("button", { name: "Create a game" }).click();
await host.page.getByRole("heading", { name: "Before you start" }).waitFor({ timeout: 15000 });
const code = (await host.page.locator("p.display").first().textContent()).trim();
check("host lands in lobby with a 6-char code", /^[A-Z0-9]{6}$/.test(code), code);

await runner.page.getByLabel("Your name").fill("Rue");
await runner.page.getByLabel("Join code").fill(code);
await runner.page.getByRole("button", { name: "Join", exact: true }).click();
await runner.page.getByRole("heading", { name: "Before you start" }).waitFor({ timeout: 15000 });
check("runner joins the lobby", true);

console.log("lobby");
await host.page.getByRole("group", { name: "Role for Hosty" }).getByRole("button", { name: "Chaser" }).click();
await runner.page.getByRole("group", { name: "Role for Rue" }).getByRole("button", { name: "Runner" }).click();
await host.page.getByRole("button", { name: "Draw the zone" }).click();
await host.page.getByRole("button", { name: "Use my location as the centre" }).waitFor({ timeout: 10000 });
await host.page.getByRole("button", { name: "Use my location as the centre" }).click();
await host.page.getByRole("button", { name: "Save zone" }).click();
await host.page.getByText(/Circle, /).waitFor({ timeout: 10000 });
check("zone saved and shown", true);

await host.page.getByLabel("Runner head start").selectOption("0");
await host.page.getByLabel("Runner positions shown to chasers every").selectOption("15");
await runner.page.getByRole("button", { name: "I'm ready" }).click();
await host.page.getByRole("button", { name: "I'm ready" }).click().catch(() => {});
await host.page.waitForTimeout(500);
await host.page.screenshot({ path: `${SHOTS}/02-lobby-host.png`, fullPage: true });
await runner.page.screenshot({ path: `${SHOTS}/03-lobby-runner.png`, fullPage: true });

const start = host.page.getByRole("button", { name: "Start the game" });
await start.waitFor();
await host.page.waitForFunction(() => !document.querySelector("button")?.textContent?.includes("Start the game") || true);
check("start enabled once everyone is ready", await start.isEnabled().catch(() => false));
await start.click();

console.log("game");
await runner.page.getByText("Your catch code").waitFor({ timeout: 15000 });
await host.page.getByRole("button", { name: "Enter code" }).waitFor({ timeout: 15000 });
check("both phones are in the game", true);
const catchCode = (await runner.page.locator("p.display", { hasText: /^\d{4}$/ }).first().textContent()).trim();
check("runner sees a 4-digit code", /^\d{4}$/.test(catchCode), catchCode);

await host.page.waitForTimeout(6000);
await runner.page.screenshot({ path: `${SHOTS}/04-game-runner.png` });
await host.page.screenshot({ path: `${SHOTS}/05-game-chaser.png` });
const compassText = await runner.page.locator("svg[role=img]").first().getAttribute("aria-label");
check("runner compass sees the chaser", /Nearest chaser/.test(compassText || ""), compassText);

// Reveals come every 15 s and the first one has nobody in it, so give the chaser time to get a real one.
await host.page.waitForFunction(() => window.__seen && window.__seen["zh-ping"], null, { timeout: 30000 }).catch(() => {});

console.log("catch");
await host.page.getByRole("button", { name: "Enter code" }).click();
await host.page.screenshot({ path: `${SHOTS}/06-catchpad.png` });
for (const d of catchCode) await host.page.getByRole("button", { name: d, exact: true }).click();
await host.page.getByText(/Rue is caught/).waitFor({ timeout: 10000 });
check("catch succeeds from the keypad", true);
await host.page.getByRole("button", { name: "Back to the chase" }).click();

await host.page.getByRole("heading", { name: "Chasers win" }).waitFor({ timeout: 15000 });
await runner.page.getByRole("heading", { name: "Chasers win" }).waitFor({ timeout: 15000 });
check("both phones show the result", true);
await host.page.screenshot({ path: `${SHOTS}/07-result.png` });

console.log("motion");
const hostSeen = await host.page.evaluate(() => window.__seen);
const runnerSeen = await runner.page.evaluate(() => window.__seen);
check("chaser saw the radar ping on a reveal", !!hostSeen["zh-ping"], JSON.stringify(hostSeen));
check("both phones saw the Game on flash", !!hostSeen["zh-splash"] && !!runnerSeen["zh-splash"], JSON.stringify([hostSeen, runnerSeen]));
check("catch pad slid up", !!hostSeen["zh-sheet"], JSON.stringify(hostSeen));

console.log("resilience");
const guest = await phone("Late", 0);
await guest.page.getByLabel("Your name").fill("Late");
await guest.page.getByLabel("Join code").fill(code);
await guest.page.getByRole("button", { name: "Join", exact: true }).click();
await guest.page.getByText(/already started/).waitFor({ timeout: 10000 });
check("joining a started game shows a clear error", true);

// Reload mid-session: the phone should land back in the same place.
await runner.page.reload();
await runner.page.getByRole("heading", { name: "Chasers win" }).waitFor({ timeout: 15000 });
check("reload restores the session", true);

for (const p of [host, runner, guest]) {
  check(`no console errors on ${p.name}`, p.errors.length === 0, p.errors.slice(0, 2).join(" | "));
}

await browser.close();
console.log(failures === 0 ? "\nAll good." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
