# Generic full Eve v61 container deployment

The supplied Compose stack now runs:

- Eve;
- PostgreSQL 16;
- persistent Eve research-data volume;
- persistent PostgreSQL volume.

Copy `.env.example` to `.env`, set strong unique values, then run:

```bash
docker compose up -d --build
```

For production, place Eve behind HTTPS and use managed PostgreSQL/object storage where your organisation's platform already provides them.
