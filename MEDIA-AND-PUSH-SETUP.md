# DALLYLETTER ELIDEMS — Persistent Media + Background Push

## Persistent media

The API now supports an S3-compatible object-storage connector. It is provider-neutral and remains disabled until all four server variables are configured:

- `MEDIA_S3_ENDPOINT`
- `MEDIA_S3_BUCKET`
- `MEDIA_S3_ACCESS_KEY_ID`
- `MEDIA_S3_SECRET_ACCESS_KEY`
- optional `MEDIA_S3_REGION` (defaults to `auto`)

Cloudflare R2 is a recommended low-cost option because it exposes an S3-compatible API and currently includes a monthly free tier of 10 GB standard storage, 1 million Class A operations and 10 million Class B operations, with no internet egress charge.

When these variables are absent, local-media fallback is for development only. Production uploads fail explicitly instead of silently storing files on an ephemeral disk. When all required variables are present, lesson, assignment, exercise-answer and chat media are uploaded to object storage and served from there, while existing database-backed voice recovery remains available.

Never put object-storage secrets in frontend code or Git.

## Background Web Push

Server variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example a mailto: or HTTPS contact URI)

The public key is exposed to authenticated browsers only through `/api/push/config`. The private key is backend-only.

Flow:

1. User sees the Dallyletter-branded permission card.
2. User explicitly clicks **Allow notifications**.
3. Browser requests notification permission.
4. Service worker creates a PushSubscription using the VAPID public key.
5. Authenticated subscription details are stored server-side.
6. The API dispatcher detects new application notifications.
7. The server encrypts each payload using the subscription's P-256 key and auth secret.
8. VAPID authenticates the request to the browser push service.
9. The push service wakes the service worker even when Dallyletter is closed.
10. The service worker displays the branded notification and routes clicks to the exact activity.

The implementation uses the Web Push AES-128-GCM and VAPID standards rather than a proprietary browser-specific transport.

## Key safety

- VAPID private key: Render/Replit secret only.
- Object-storage secret: Render/Replit secret only.
- Push subscription endpoints and encryption secrets: database only; never log them.
- Public VAPID key may be delivered to authenticated clients.

## Production media storage workflow

Teacher/Learner selects file
        |
        v
Authenticated API upload
        |
        v
Temporary server file (only during upload)
        |
        +--> S3-compatible object storage configured? --> YES --> PUT /media/<UUID>
        |                                                        |
        |                                                        v
        |                                              DB keeps stable media URL/key
        |                                                        |
        |                                                        v
        |                                              Authenticated GET + HTTP Range
        |
        +--> NO --> local fallback (development only)

For production, configure an S3-compatible persistent provider. The application never puts provider credentials in the browser. Media is addressed by a UUID storage key, streamed through the authenticated API, supports HTTP Range requests for audio/video, and is deleted from both object storage and local fallback when the owning record is deleted.

Required server variables:
- MEDIA_S3_ENDPOINT
- MEDIA_S3_BUCKET
- MEDIA_S3_ACCESS_KEY_ID
- MEDIA_S3_SECRET_ACCESS_KEY
- MEDIA_S3_REGION=auto for Cloudflare R2

Recommended current provider: Cloudflare R2 Standard storage. Its current free tier includes 10 GB-month, 1 million Class A operations, 10 million Class B operations, and free egress. The free allowance is monthly and Cloudflare can change pricing, so the project must not claim that any third-party free tier is guaranteed forever. Keep usage under the allowance and configure billing alerts.

Never store media credentials in Git, frontend environment variables, database rows, or chat messages.