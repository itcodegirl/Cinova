# Cinova
Cinova (ScreenScout) is a movie and TV show browser powered by the TMDB (The Movie Database) API.

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
