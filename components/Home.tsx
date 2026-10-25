"use client";

import { useEffect, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { promptInstall, useInstallState } from "@/lib/install";
import type { Session } from "@/lib/types";
import { Button } from "./ui";
import Logo from "./Logo";
import Reveal from "./Reveal";
import HuntDemo, { ZoneMap, DemoCompass } from "./HuntDemo";

export default function Home({
  notice,
  onSession,
}: {
  notice: string | null;
  onSession: (s: Session) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const install = useInstallState();

  useEffect(() => {
    try {
      setName(localStorage.getItem("zh_name") ?? "");
    } catch {}
  }, []);

  const go = async (kind: "create" | "join") => {
    const clean = name.trim();
    if (!clean)
      return setError("Pick a name first. It's what the others will see.");
    if (kind === "join" && code.length !== 6)
      return setError("Join codes are 6 characters.");
    setBusy(kind);
    setError(null);
    try {
      localStorage.setItem("zh_name", clean);
    } catch {}
    try {
      const session =
        kind === "create"
          ? await api.createGame(clean)
          : await api.joinGame(code, clean);
      onSession(session);
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? e.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="landing">
      <nav className="landing-nav landing-frame" aria-label="Main navigation">
        <a href="#" className="brand" aria-label="Zonehunt home">
          <Logo className="size-8" />
          <span>Zonehunt</span>
        </a>
        <div className="nav-links">
          <a href="#how-to-play">How to play</a>
          <a href="#questions">Questions</a>
        </div>
        <a className="nav-play" href="#play">
          Let's play{" "}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 19 19 5M5 5h14v14" />
          </svg>
        </a>
      </nav>

      <Reveal className="landing-hero landing-frame">
        <div className="hero-intro">
          <h1 data-reveal className="display">
            Go outside.
            <br />
            Go off the radar.
          </h1>
          <div data-reveal className="hero-description">
            <p>
              A real-life manhunt, powered by your phone. Round up your friends.
              Draw your zone. Let the chase begin.
            </p>
            <a href="#how-to-play" className="text-link">
              See how it works <span aria-hidden="true">&darr;</span>
              {!install.standalone && install.secure && (
                <div>
                  {install.canPrompt ? (
                    <Button tone="plain" onClick={() => promptInstall()}>
                      Install the app
                    </Button>
                  ) : (
                    <p>
                      {install.ios
                        ? "On iPhone: tap Share, then Add to Home Screen."
                        : "We reccomend using Chrome"}
                    </p>
                  )}
                </div>
              )}
            </a>
          </div>
        </div>
        <div className="hero-play-grid">
          <div data-reveal>
            <HuntDemo />
          </div>
          <div data-ui data-reveal id="play" className="play-panel">
            <h2 className="display">
              Your next game
              <br />
              starts here.
            </h2>
            <p>No sign-up. Just your friends and somewhere to run.</p>
            {!install.secure && (
              <p role="alert" className="home-warning">
                Open the HTTPS address to use GPS, screen wake and app
                installation.
              </p>
            )}
            {notice && (
              <p role="status" className="home-notice">
                {notice}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void go("create");
              }}
            >
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="What do your friends call you?"
              />
              <Button
                big
                type="submit"
                disabled={busy !== null}
                className="create-button"
              >
                {busy === "create" ? "Creating..." : "Create a game"}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 19 19 5M5 5h14v14" />
                </svg>
              </Button>
            </form>
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault();
                void go("join");
              }}
            >
              <label htmlFor="code">Already have a code?</label>
              <div className="join-controls">
                <input
                  id="code"
                  aria-label="Join code"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6),
                    )
                  }
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="6-character code"
                />
                <Button type="submit" tone="plain" disabled={busy !== null}>
                  {busy === "join" ? "Joining..." : "Join"}
                </Button>
              </div>
            </form>
            {error && (
              <p role="alert" className="home-warning">
                {error}
              </p>
            )}
          </div>
        </div>
      </Reveal>

      <section id="how-to-play" className="how-section landing-frame">
        <Reveal>
          <div className="section-intro">
            <h2 data-reveal className="display">
              Same zone.
              <br />
              Different missions.
            </h2>
            <p data-reveal>
              One team buys time. The other closes the gap. Your phone gives you
              a clue, never the whole picture.
            </p>
          </div>
          <div className="role-story">
            <div data-reveal className="role-story-copy">
              <h3 className="display">Chase the next clue.</h3>
              <p>
                Chasers get runner positions at timed intervals. Make your move
                before the next snapshot changes everything.
              </p>
              <p>
                Find a runner, get close, and enter the catch code from their
                phone.
              </p>
            </div>
            <div data-ui data-reveal className="feature-map">
              <ZoneMap revealed compact />
              <div className="fragment-caption">
                <strong>Runner update</strong>
                <span>Two positions. Your next move.</span>
              </div>
            </div>
          </div>
          <div className="role-story runner-story">
            <div data-ui data-reveal className="feature-compass">
              <DemoCompass />
              <span className="compass-caption">A direction, not a route.</span>
            </div>
            <div data-reveal className="role-story-copy">
              <h3 className="display">Stay one turn ahead.</h3>
              <p>
                Runners see the direction and distance to the nearest chaser in
                range. Watch your compass and keep your escape open.
              </p>
              <p>
                Stay free until the clock runs out. The runners win if someone
                makes it.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="setup-section">
        <Reveal className="landing-frame setup-grid">
          <div>
            <h2 data-reveal className="display">
              Your turf.
              <br />
              Your rules.
            </h2>
            <p data-reveal>
              Make the game fit your group. The host draws a zone, assigns teams
              and sets the pace before anyone takes off.
            </p>
            <a data-reveal href="#play" className="text-link">
              Set up your game{" "}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 19 19 5M5 5h14v14" />
              </svg>
            </a>
          </div>
          <div data-ui data-reveal className="rules-fragment">
            <div className="rules-fragment-title">
              <Logo className="size-6" />
              <strong>A game your way</strong>
            </div>
            <dl>
              <div>
                <dt>Play zone</dt>
                <dd>Circle or custom boundary</dd>
              </div>
              <div>
                <dt>Game length</dt>
                <dd>10 to 120 minutes</dd>
              </div>
              <div>
                <dt>Position updates</dt>
                <dd>15 seconds to 5 minutes</dd>
              </div>
              <div>
                <dt>Runner head start</dt>
                <dd>Up to 5 minutes</dd>
              </div>
              <div>
                <dt>Power-ups</dt>
                <dd>Scan and Stealth</dd>
              </div>
            </dl>
            <p>Set these in your lobby before the game starts.</p>
          </div>
        </Reveal>
      </section>

      <section id="questions" className="faq-section landing-frame">
        <Reveal className="faq-grid">
          <h2 data-reveal className="display">
            Before you
            <br />
            head out.
          </h2>
          <div data-reveal className="faq-list">
            {[
              [
                "Does everyone need an account?",
                "No. Pick a name and create a game, or enter a friend's six-character join code. Each player needs their own phone and an internet connection.",
              ],
              [
                "Do I need to install anything?",
                "You can play in your browser. For the best experience, add Zonehunt to your home screen, allow location access and keep the app open while you play.",
              ],
              [
                "Can chasers see runners all the time?",
                "No. Chasers get snapshots at the interval set by the host. Runners see a compass pointing toward the nearest chaser in range, rather than a map of their positions.",
              ],
              [
                "What if we need a break?",
                "The host can pause the game. The countdown and position updates stop until it resumes. Pause straight away if anyone is hurt or lost.",
              ],
              [
                "What happens to our locations?",
                "Locations are collected during an active game. The game, positions and feed are deleted a few minutes after it ends.",
              ],
              [
                "Where should we play?",
                "Choose a safe, familiar place with people you know. Stay away from roads and private property. Agree on boundaries together before you start. This is not a navigation or emergency tool.",
              ],
            ].map(([question, answer]) => (
              <details name="questions" key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true" className="faq-plus">
                    +
                  </span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </section>

      <footer className="landing-footer">
        <Reveal className="landing-frame">
          <div className="footer-top">
            <div>
              <h2 data-reveal className="display">
                Take the long way home.
              </h2>
              <p data-reveal>
                Your friends. Your neighbourhood. A very different afternoon.
              </p>
            </div>
            <a data-reveal className="footer-play" href="#play">
              Let's play{" "}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 19 19 5M5 5h14v14" />
              </svg>
            </a>
          </div>
          {!install.standalone && install.secure && (
            <div data-reveal className="install-note">
              {install.canPrompt ? (
                <Button tone="plain" onClick={() => promptInstall()}>
                  Install the app
                </Button>
              ) : (
                <p>
                  {install.ios
                    ? "On iPhone: tap Share, then Add to Home Screen."
                    : "Add Zonehunt to your home screen from your browser menu."}
                </p>
              )}
            </div>
          )}
          <div data-reveal className="footer-wordmark">
            <Logo />
            <span className="display">Zonehunt</span>
          </div>
          <div className="footer-bottom">
            <span>A real-life manhunt.</span>
            <a href="https://elias4044.com">Made by Elias.</a>
          </div>
        </Reveal>
      </footer>
    </main>
  );
}
