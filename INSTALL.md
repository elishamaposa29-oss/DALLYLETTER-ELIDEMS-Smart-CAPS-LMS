# Local development setup

## Requirements
- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

## Install
```bash
pnpm install
cp .env.example .env
```

## Configure environment
Update .env with your own values before starting the app.

## Start locally
```bash
pnpm dev
```

This starts:
- API server on http://localhost:4000
- Web app on http://localhost:3000

## Build for production
```bash
pnpm build
```

## Database
The backend expects PostgreSQL via DATABASE_URL. You can run a local Postgres container if needed:

```bash
docker run --name dalllyletter-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=dallyletter -p 5432:5432 -d postgres:16
```
