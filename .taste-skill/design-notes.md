# Zonehunt design notes

Direction: The product performs. Seed: 985099581. No redraws.
Palette and Archivo type preserved. Product roles use existing orange and blue.
App fragments: Accent ladder, seed 830851438, mapped to existing role colors.

Inventory: Zonehunt name; hand-drawn circle or polygon zone; six-character join code; four-digit catch code; timed location snapshots; runner compass; head start; Scan; Stealth; referee role; ephemeral locations; phone-first outdoor play.

Argument and copy deck:
- Go outside. Go off the radar. Real-life manhunt: prove it with the chaser/runner preview and real create/join forms.
- Same zone. Different missions. Timed runner positions and catch codes for chasers; bearing and distance for runners.
- Your turf. Your rules. Draw a zone, choose teams, set duration and reveal intervals; show actual supported settings.
- Before you head out. Answer accounts, installation, visibility, pause, privacy and safe play.
- Take the long way home. Return to the real game action and installation.

Idea: On this page, Zonehunt's asymmetric map snapshots and runner compass become the interactive introduction to the game.
Live thing: Switch between chaser and runner views; reveal and hide runner positions.

Imagery: Four authored product UI fragments (interactive role preview, map, compass, game settings) plus the real game form. No stock or found imagery; no external image credits needed. Map geography, Mia/Alex, 14:32 and 180 m are illustrative demo content, explicitly labeled in the hero. They never enter the actual game state.
No real-world footage is used: the responsive product demonstration is the primary explanatory medium and does not imply background GPS or uninterrupted live runner tracking.

ROUND 1
Seen in one second: Go outside, with a playable map and game entry.
Idea (one sentence): The two teams' different information becomes the preview.
Live thing: Role switch and runner reveal.
Layout words by section: hero=interactive split / missions=paired stories / setup=dark field / FAQ=filled list / footer=wordmark
Scores: design 7.5 / usability 8 / creativity 7 / content 8 -> overall 7.6
Caps applied: Outstanding reduced-hidden inspection issue, overall cap 6 pending fix.
Top three problems (most visible first), each with screenshot and fix:
1. Arrow entity renders as text on desktop-fold: replace with inline SVG.
2. Hidden runner labels remain in accessibility tree: mount only when revealed, with AnimatePresence exits.
3. Footer phone text is 12px: increase to 13px.

Motion gates: Marketing is rare/first-view, purpose explanation and delight. Game sheets and roster changes are occasional, purpose spatial consistency and state indication. Button feedback is subtle and fast. Keypad digits and clocks remain immediate.
Ingredients: Framer Motion full transform strings and opacity; strong ease-out (0.23,1,0.32,1), 200-280ms app UI, 600ms marketing reveals, 60ms stagger. Existing drawer curve (0.32,0.72,0,1). CSS press feedback 140ms. Reduced motion removes travel and stops decorative compass movement.

ROUND 2
Seen in one second: An outdoor manhunt with a usable game form.
Idea (one sentence): Different information for each team becomes the explanation.
Live thing: Chaser/runner switch, with runner position reveal.
Layout words by section: hero=interactive split / missions=paired stories / setup=dark field / FAQ=filled list / footer=wordmark
Scores: design 7.5 / usability 8 / creativity 7 / content 8 -> overall 7.6
Caps applied: No meter FAILs; creativity capped at 7 because asymmetric pursuit is a category idea.
Top three problems (most visible first), each with screenshot and fix:
1. Tablet-page-01 captured blank mission content during a JS-driven reveal: switched marketing reveal playback to Framer Motion mini (native WAAPI). A focused 768px check then confirmed opacity 1 for every visible reveal.
2. Type scale includes additional interface and wordmark sizes: retained readable UI hierarchy and a deliberate oversized footer identity.
3. No outdoor photography or footage: retained authored product UI as the explanation rather than adding unrelated scenery. All geography and names in the demo are illustrative.

Validation:
- Production build and TypeScript passed.
- Existing full PocketBase e2e suite passed (create, join, roles, visibility, catches, power-ups, pause and completion).
- Real-browser landing checks passed: demo reveal, role switch, FAQ, empty-name validation, create-game lobby and no phone overflow; no browser errors.
- Real-browser game checks passed: menu entry/exit, catch sheet entry/exit, pause/resume entry/exit, catch and winning result; no browser errors.
- Native reveal fix checked at 768px: all visible content opacity 1 after one second.
- Source lint for the landing and authored components passed. Whole-repository marketing lint also flags existing app table rules and floating map/dialog shadows, which follow app conventions and are outside the landing rules.
- Feel check remaining: touch interactions and outdoor GPS/compass on actual iPhone and Android hardware.

Warnings defended:
- The SVG map and compass are intentionally the explanatory imagery; no external media or sample proof was added.
- Multiple type sizes include functional UI and the oversized identity as well as editorial headings.
- The inspector's 60px/80px outer-margin warning measures text endpoints; the SVG arrow occupies the last 20px. Actual navigation and content frames both span x=60 to x=1380 at 1440px.

ROUND 3
Seen in one second: An outdoor pursuit game, ready to create or join.
Idea (one sentence): The map and compass give each team a different way to read the same zone.
Live thing: Interactive role preview and position reveal.
Layout words by section: hero=interactive split / missions=paired stories / setup=dark field / FAQ=filled list / footer=wordmark
Scores: design 7.5 / usability 8 / creativity 7 / content 8 -> overall 7.6
Caps applied: Creativity capped at 7 for a category-level concept.
Top three problems (most visible first), each with screenshot and fix:
1. Tablet footer still captured early in its reveal in verified/tablet-page-01: keep reveal starts at 85% opacity so text stays readable even if a background tab throttles playback.
2. Server/client reduced-motion preference differed on the loading screen: make its Framer entrance an opacity-only transition with identical server/client initial state.
3. Actual outdoor phone behavior is outside desktop simulation: validate compass and GPS on devices before a group outing.

Final asset verification: logo reviewed at 16, 24, 32, 48 and 96px in logo-sizes.png. SVG source is a single geometric path with a 32x32 viewBox; app SVG uses a 64x64 canvas. PNG fallbacks and maskable icon regenerated from this mark.

Before/after measurements:
| Check | Before | After |
| --- | --- | --- |
| Responsive inspector failures | 6 | 0 |
| Body copy | 14px | 16px |
| Desktop moving elements | 5 | At least 21 |
| Page content | Name + setup form | Demo, setup form, role explanation, rules, FAQ, installation |
| Responsive widths | 1440, 768, 390 | 1440, 768, 390 |

Final reduced-motion browser check: no hydration or runtime errors; footer remains visible.

Final release inspector: 0 FAIL, 4 WARN at 1440, 768 and 390px, with reduced-motion check. Every release screenshot reviewed. Tablet mission content and footer remain readable. Final critique scores unchanged: design 7.5, usability 8, creativity 7, content 8; weighted overall 7.6. Remaining limits: no photography/footage, additional UI type sizes, and real-device GPS/motion feel checks.
