# Elidems Secret Inventory

No raw values are stored in this document. The repository scan found no local `.env` file containing real credentials and no tracked private key file.

| Name                     | Purpose/service              | Classification                | Required       | Current source                       |
| ------------------------ | ---------------------------- | ----------------------------- | -------------- | ------------------------------------ |
| `DATABASE_URL`           | PostgreSQL connection        | production/development secret | yes for API/DB | host secret manager; absent locally  |
| `JWT_SECRET`             | JWT signing                  | production secret             | yes            | host secret manager; absent locally  |
| `AUTH_SECRET`            | JWT compatibility fallback   | production secret             | optional       | host secret manager if configured    |
| `OPENAI_API_KEY`         | optional AI provider         | provider secret               | optional       | host secret manager; absent locally  |
| `GEMINI_API_KEY`         | optional AI provider         | provider secret               | optional       | host secret manager; absent locally  |
| `STRIPE_SECRET_KEY`      | payment server credential    | provider secret               | optional       | host secret manager; absent locally  |
| `PAYPAL_CLIENT_SECRET`   | payment credential           | provider secret               | optional       | host secret manager; absent locally  |
| `STRIPE_PUBLISHABLE_KEY` | payment client configuration | sensitive config              | optional       | host/frontend config; absent locally |
| `PAYPAL_CLIENT_ID`       | payment client configuration | sensitive config              | optional       | host config; absent locally          |

No encrypted backup was created because no actual secret payload was available locally. Provider values must be exported through an approved operator workflow before encryption. Do not copy them into GitHub, chat, logs, or this repository.
