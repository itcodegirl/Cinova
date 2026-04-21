# Cinova
Cinova (ScreenScout) is a movie and TV show browser powered by the TMDB (The Movie Database) API.

## Stack & Entry Point
- Runtime: static HTML/CSS/vanilla JavaScript
- Entry point: `index.html`
- Tooling: Node.js scripts for checks + Playwright for end-to-end and accessibility tests
- Build step: none (app runs directly from `index.html`)

## Run Locally
Open `index.html` directly in a browser, or serve the project folder with any static file server.

Fastest local workflow:

```bash
npm run dev
```

This starts the local preview server and opens the app in your browser.
Set `NO_OPEN=1` to skip auto-open.

LAN/mobile testing:

```bash
npm run dev:lan
```

Optional host/port overrides:
- env vars: `HOST=0.0.0.0 PORT=5000 npm run dev`
- CLI flags: `npm run dev -- --host 0.0.0.0 --port 5000`

The app flow is:
1. Enter TMDB Read Access Token in setup overlay
2. App validates token and loads genres
3. Hero + sections render; search, watchlist, modal detail views available

## Local Checks
Run the lightweight project validation:

```bash
npm run check
```

This verifies:
- basic HTML document structure in `index.html`
- inline script syntax validity in `index.html`
- duplicate/missing critical element IDs
- key accessibility semantics for navigation, search, and modal dialog
- UTF-8 encoding hygiene across tracked text files

Type check JavaScript (Node scripts + Playwright tests):

```bash
npm run typecheck
```

Build a production snapshot:

```bash
npm run build
```

This writes `dist/index.html`.

Run end-to-end smoke and accessibility tests:

```bash
npm test
```

Useful subsets:
- `npm run test:unit`
- `npm run test:smoke`
- `npm run test:a11y`
- `npm run test:setup`
- `npm run test:resilience`

## Available Scripts
- `npm run dev`: run preview server and auto-open `http://localhost:4173`
- `npm run dev:lan`: run preview server on `0.0.0.0` for LAN/mobile testing (prints LAN URLs)
- `npm run preview`: run local static preview server at `http://127.0.0.1:4173`
- `npm run preview:lan`: run local static preview server on `0.0.0.0` (prints LAN URLs)
- `npm run build`: create a fresh `dist/` snapshot with `index.html`
- `npm run check`: custom static quality checks for `index.html`
- `npm run check:encoding`: standalone UTF-8 encoding and mojibake guard
- `npm run lint`: alias to `npm run check`
- `npm run typecheck`: TypeScript-powered static checks for JS in `scripts/` and `tests/`
- `npm run test:unit`: Node unit tests for helper logic
- `npm test`: full Playwright suite
- `npm run test:smoke`: smoke scenarios
- `npm run test:a11y`: axe-core accessibility assertions
- `npm run test:setup`: setup/token resilience scenarios
- `npm run test:resilience`: transient API failure recovery scenarios
- `npm run ci`: `check` + `typecheck` + `build` + `test:unit` + full Playwright tests

Runtime resilience highlights:
- setup overlay has a built-in retry action for transient TMDB failures
- TMDB `429` responses use bounded retry/backoff with `Retry-After` support
- hero, section, and search areas show inline retry actions on transient fetch errors

Local preview security baseline (`npm run preview`):
- Content Security Policy (CSP)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera/geolocation/microphone disabled)

Accessibility and polish highlights:
- setup errors are announced via an assertive live region
- trailer embeds include descriptive iframe titles
- reduced-motion users get minimal animation/transition effects

## CI
GitHub Actions runs the same check on each push and pull request via `.github/workflows/checks.yml`.
