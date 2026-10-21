# EshopScope Instagram autopilot

- `AUTOPILOT.md` – step-by-step procedure for the scheduled cloud runs (CREATE / PUBLISH).
- `CONTENT.md` – binding content + visual rules (Czech). Read before writing any post.
- `templates/poster.html`, `templates/editorial.html` – slide templates driven by `posts/<id>/post.json`.
- `scripts/` – render (Puppeteer), photos (Pexels/Unsplash API), telegram (preview/STOP), publish (Instagram Graph API).
- Secrets come from environment variables (see `.env.example`), never commit them.
