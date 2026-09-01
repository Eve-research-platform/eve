# Eve development and release — v61

## Runtime dependency

v61 adds the Node `pg` package for the PostgreSQL operational-state backend.

The Dockerfile installs production dependencies before starting Eve.

## State backend

Local/simple file mode is the fallback.

PostgreSQL can be enabled with either:

```text
EVE_STATE_BACKEND=postgres
EVE_DATABASE_URL=postgres://...
```

or normal PostgreSQL variables:

```text
PGHOST=...
PGPORT=5432
PGDATABASE=eve
PGUSER=...
PGPASSWORD=...
```

Use `EVE_DATABASE_SSL=require` where provider policy requires TLS.

## Migration

`lib/state_store.js` registers legacy JSON locations for each migrated subsystem.

On first database startup, missing database keys may be seeded from those legacy files. Existing database rows are not replaced by legacy copies.

## Tests

```text
npm run check
npm test
```

v61 tests cover:

- legacy → PostgreSQL state migration;
- two-instance state visibility using a shared database abstraction;
- advisory-lock contracts;
- Google Cloud SQL deployment configuration;
- Azure PostgreSQL deployment configuration;
- Docker PostgreSQL deployment;
- full historical v50–v60.1 regressions.

## Browser tests

```text
npm run e2e
```

The current managed build environment still cannot execute the localhost Chromium release journey because of administrator URL blocking. Do not claim it passed here.
