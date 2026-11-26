# Environment Variables Map

Values are intentionally omitted. “Source” means where code reads the variable; “template” means a safe repository example.

| Variable                     | Service/source                | Phase                  | Required            | Sensitive  | Configuration source                        |
| ---------------------------- | ----------------------------- | ---------------------- | ------------------- | ---------- | ------------------------------------------- |
| `DATABASE_URL`               | API, Drizzle, DB verification | backend runtime        | required            | secret     | host secret store; `.env.example` name only |
| `JWT_SECRET`                 | API auth                      | backend runtime        | production required | secret     | host secret store                           |
| `AUTH_SECRET`                | API auth fallback             | backend runtime        | optional            | secret     | host secret store if used                   |
| `NODE_ENV`                   | API, Vite, mobile tooling     | build/runtime          | optional            | non-secret | deployment environment                      |
| `PORT`                       | API, Vite, mobile server      | runtime                | optional            | non-secret | host-provided config                        |
| `API_PORT`                   | API                           | runtime                | optional            | non-secret | host environment                            |
| `LOG_LEVEL`                  | API logger                    | runtime                | optional            | non-secret | host environment                            |
| `CORS_ORIGINS`               | API CORS                      | backend runtime        | deployed required   | non-secret | Render or host config                       |
| `API_BASE_URL`               | web API fallback              | frontend build/runtime | optional            | non-secret | frontend build environment                  |
| `VITE_API_BASE_URL`          | web API URL                   | frontend build         | deployed required   | non-secret | Vercel/project environment                  |
| `VITE_APP_NAME`              | web branding                  | frontend build         | optional            | non-secret | frontend build environment                  |
| `BASE_PATH`                  | Vite/mobile server            | build/runtime          | optional            | non-secret | host environment                            |
| `VITE_PORT`                  | Vite dev server               | development            | optional            | non-secret | local environment                           |
| `EXPO_PUBLIC_API_BASE_URL`   | mobile API URL                | mobile build/runtime   | optional            | non-secret | Expo environment                            |
| `EXPO_PUBLIC_API_URL`        | mobile API URL legacy fallback | mobile build/runtime | optional            | non-secret | Expo environment                           |
| `EXPO_PUBLIC_DOMAIN`         | mobile API fallback           | mobile build           | optional            | non-secret | Expo environment                            |
| `REPLIT_INTERNAL_APP_DOMAIN` | mobile build fallback         | mobile build           | optional            | non-secret | Replit environment                          |
| `REPLIT_DEV_DOMAIN`          | mobile build fallback         | mobile build           | optional            | non-secret | Replit environment                          |
| `REPL_ID`                    | mobile build metadata         | mobile build           | optional            | non-secret | Replit/Expo environment                     |
| `EXPO_PUBLIC_REPL_ID`        | mobile metadata fallback      | mobile build           | optional            | non-secret | Expo environment                            |
| `OPENAI_API_KEY`             | optional AI provider          | backend runtime        | optional            | secret     | host secret store                           |
| `GEMINI_API_KEY`             | optional AI provider          | backend runtime        | optional            | secret     | host secret store                           |
| `STRIPE_SECRET_KEY`          | payment template              | backend runtime        | optional            | secret     | host secret store                           |
| `STRIPE_PUBLISHABLE_KEY`     | payment template              | frontend/backend build | optional            | sensitive  | host config                                 |
| `PAYPAL_CLIENT_ID`           | payment template              | backend runtime        | optional            | sensitive  | host config                                 |
| `PAYPAL_CLIENT_SECRET`       | payment template              | backend runtime        | optional            | secret     | host secret store                           |

| `MEDIA_S3_ENDPOINT`            | S3-compatible/R2 media store  | backend runtime        | production required for uploads | non-secret | Render backend environment                  |
| `MEDIA_S3_BUCKET`              | S3-compatible/R2 media store  | backend runtime        | production required for uploads | non-secret | Render backend environment                  |
| `MEDIA_S3_ACCESS_KEY_ID`       | S3-compatible/R2 media store  | backend runtime        | production required for uploads | secret     | Render backend environment                  |
| `MEDIA_S3_SECRET_ACCESS_KEY`   | S3-compatible/R2 media store  | backend runtime        | production required for uploads | secret     | Render backend environment                  |
| `MEDIA_S3_REGION`              | S3-compatible/R2 media store  | backend runtime        | optional (R2: `auto`) | non-secret | Render backend environment                  |
| `VAPID_PUBLIC_KEY`             | Web Push                     | backend runtime        | optional            | non-secret | Render backend environment                  |
| `VAPID_PRIVATE_KEY`            | Web Push                     | backend runtime        | optional            | secret     | Render backend environment                  |
| `VAPID_SUBJECT`                | Web Push                     | backend runtime        | optional            | non-secret | Render backend environment                  |
| `PAYNOW_INTEGRATION_ID`        | Paynow checkout               | backend runtime        | required for live Paynow | sensitive  | Render backend environment                  |
| `PAYNOW_INTEGRATION_KEY`       | Paynow checkout/webhook       | backend runtime        | required for live Paynow | secret     | Render backend environment                  |
| `PUBLIC_APP_URL`               | Paynow return URL             | backend runtime        | required for live Paynow | non-secret | Render backend environment                  |
| `PUBLIC_API_URL`               | Paynow result callback        | backend runtime        | required for live Paynow | non-secret | Render backend environment                  |

The repository also contains a PayPal merchant URL in `.replit`; treat deployment-console configuration as sensitive until independently reviewed. No values are reproduced here.
