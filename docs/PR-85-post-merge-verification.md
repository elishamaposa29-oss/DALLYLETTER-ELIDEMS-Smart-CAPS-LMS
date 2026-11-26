# PR #85 — Post-merge verification ledger

Base revision: `b88e503dee73b6db093851c60b45a4e5ba877a43` (PR #84 merge).

## Confirmed from source/deployment metadata

- The merged API source defines `POST /users/me/cover`, stores the uploaded media reference separately in `user_profile_covers`, and returns `coverUrl` / `coverType`.
- The public-profile API reads that cover reference and returns `cover_url` / `cover_type`.
- Render service `DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4` is configured for `main`; its latest deploy `dep-dbgkd1i9lscs73fjdnb0` is `live` on merge commit `b88e503dee73b6db093851c60b45a4e5ba877a43`.
- Vercel production deployment metadata reports `READY` for the same merge commit.
- Google ID-token validation already verifies the RS256 signature against Google's JWKS and checks issuer, audience, subject, verified email, expiry and issued-at time. This PR additionally checks `azp` when present and requires it to match the configured client for multi-audience tokens.

## Not yet proven; do not mark complete without evidence

- An authenticated upload against the live Render API and a reload of that same user's profile; no production user token was used.
- Real inbox delivery of signup verification and password-reset messages. Provider acceptance alone is not delivery proof; confirm the actual message in an authorized inbox.
- End-to-end Google OAuth against the deployed browser origin, including the browser's configured authorized JavaScript origin and a real ID token.
- Fullscreen and media persistence on a real Android device and a browser. CI's APK build does not replace device smoke tests.

## Safety constraints

- Do not change production database contents, run destructive migrations, or expose credentials/tokens.
- Do not trigger a live email or password-reset flow without a specifically authorized test inbox/account.
- Keep this work in one PR (#85); do not create another PR for the same scope.
