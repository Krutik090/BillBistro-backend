-- Runs once on first container start (docker-entrypoint-initdb.d).
-- Creates the non-owner runtime role so Postgres RLS actually applies to the API.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'billbistro_app') THEN
    CREATE ROLE billbistro_app LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT CONNECT ON DATABASE billbistro TO billbistro_app;
