# Payment provider configuration

This document describes the server-side configuration required by the secure checkout routes. Never place provider secrets in frontend settings, mobile app configuration, source code, or client requests.

## Paynow

Configure these secrets on the API service:

- `PAYNOW_INTEGRATION_ID`
- `PAYNOW_INTEGRATION_KEY`
- `PUBLIC_APP_URL` — canonical HTTPS learner-facing web origin
- `PUBLIC_API_URL` — canonical HTTPS API origin

The learner web and Android clients query `GET /api/payments/paynow/status`. The Paynow button is shown only when the API confirms all four requirements are present and valid. The server still validates configuration when a checkout is created.

Paynow callback URL:

- `POST {PUBLIC_API_URL}/api/payments/paynow/result`

## PayPal

Create a PayPal REST application in the intended environment and configure these secrets on the API service:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID` — the webhook ID returned by PayPal after creating the webhook
- `PAYPAL_ENVIRONMENT` — set to `live` for live credentials; otherwise the API uses PayPal Sandbox
- `PUBLIC_APP_URL` — canonical HTTPS learner-facing web origin

Register this webhook URL in the same PayPal environment as the REST credentials:

- `{PUBLIC_API_URL}/api/payments/paypal/webhook`

Subscribe to at least:

- `PAYMENT.CAPTURE.COMPLETED`

The API verifies PayPal's webhook signature with PayPal before changing a school-fee payment to paid. It then retrieves the order from PayPal and checks the completed order, USD currency, order reference, and captured amount against the locally stored checkout record. Browser return URLs and learner self-reports do not mark a payment as paid.

The learner web and Android clients query `GET /api/payments/paypal/status`; checkout remains hidden until credentials, webhook ID, and HTTPS public app URL are configured.

## CORS

Set `CORS_ORIGINS` on the API service to a comma-separated list of exact trusted origins, including scheme and host, for example:

`https://your-approved-dallyletter-domain.example,https://your-approved-preview.example`

Do not use wildcard hosts such as `https://*.vercel.app`. Add a preview origin only after confirming that it belongs to the Dallyletter project. Localhost origins are enabled only outside production.

## Verification checklist

1. Use PayPal Sandbox and Paynow test credentials before enabling live payments.
2. Confirm the learner clients show each provider only when its status endpoint returns `configured: true`.
3. Confirm checkout creation returns a provider approval URL and creates a pending provider-linked payment record.
4. Confirm a valid provider callback changes only its matching pending record.
5. Confirm invalid signatures, wrong amounts, unrelated references, and duplicate callbacks do not mark payments paid.
6. Confirm the live API and frontend origins are explicitly listed in `CORS_ORIGINS`.

## Known ledger limitation

Provider verification is not the same as invoice allocation. This implementation verifies a checkout record and records the captured amount; it does not yet allocate partial or full receipts across pre-existing monthly invoice rows, handle refunds against those allocations, or prevent the current balance summary from counting legacy invoice rows separately. Do not treat the school-fee ledger as fully reconciled until that separate ledger design and migration are reviewed and tested.
