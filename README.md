# Cinova
Cinova (ScreenScout) is a movie and TV show browser powered by the TMDB (The Movie Database) API.

## Stack & Entry Point
- Runtime: static HTML/CSS/vanilla JavaScript
- Entry point: `index.html`
- Tooling: Node.js scripts for checks + Playwright for end-to-end and accessibility tests
- Build step: none (app runs directly from `index.html`)

## Run Locally
Open `index.html` directly in a browser, or serve the project folder with any static file server.

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

Run end-to-end smoke and accessibility tests:

```bash
npm test
```

Useful subsets:
- `npm run test:smoke`
- `npm run test:a11y`
- `npm run test:setup`
- `npm run test:resilience`

## Available Scripts
- `npm run check`: custom static quality checks for `index.html`
- `npm run lint`: alias to `npm run check`
- `npm test`: full Playwright suite
- `npm run test:smoke`: smoke scenarios
- `npm run test:a11y`: axe-core accessibility assertions
- `npm run test:setup`: setup/token resilience scenarios
- `npm run test:resilience`: transient API failure recovery scenarios
- `npm run ci`: `check` + full tests

Not currently configured:
- `npm run build`
- `npm run typecheck`

Runtime resilience highlights:
- setup overlay has a built-in retry action for transient TMDB failures
- TMDB `429` responses use bounded retry/backoff with `Retry-After` support
- hero, section, and search areas show inline retry actions on transient fetch errors

Accessibility and polish highlights:
- setup errors are announced via an assertive live region
- trailer embeds include descriptive iframe titles
- reduced-motion users get minimal animation/transition effects

## CI
GitHub Actions runs the same check on each push and pull request via `.github/workflows/checks.yml`.
