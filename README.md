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

## CI
GitHub Actions runs the same check on each push and pull request via `.github/workflows/checks.yml`.
