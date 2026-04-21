# Cinova
FlickFind is a movie and TV show browser powered by the TMDB (The Movie Database) API.

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

## CI
GitHub Actions runs the same check on each push and pull request via `.github/workflows/checks.yml`.
