# Database deployment

## Purpose

This project uses a managed PostgreSQL database for the production platform.

## Migration commands

```bash
pnpm db:push
```

## Backup notes

- Create regular backups from the managed PostgreSQL provider.
- Test restores in staging before production changes.
- Never run production migrations from development branches.

## Connection information

Set the connection string in the environment as:

```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Troubleshooting

- Connection refused: verify host, port, and SSL settings
- Authentication failed: rotate the database password
- Migration errors: run the same migration in staging first
