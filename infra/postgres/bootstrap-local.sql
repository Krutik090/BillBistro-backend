-- One-time local bootstrap for running BillBistro against a native Postgres (no Docker).
-- Run as the postgres superuser. Mirrors infra/postgres/init.sql + a dedicated migrate owner.
-- Safe to re-run: every step is guarded.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'billbistro_owner') THEN
    CREATE ROLE billbistro_owner LOGIN PASSWORD 'owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'billbistro_app') THEN
    CREATE ROLE billbistro_app LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Create the database owned by the migrate role (only if absent).
SELECT 'CREATE DATABASE billbistro OWNER billbistro_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'billbistro') \gexec

GRANT CONNECT ON DATABASE billbistro TO billbistro_app;

-- Make the migrate role own the public schema so migrations can create tables + grant.
\c billbistro
ALTER SCHEMA public OWNER TO billbistro_owner;
GRANT ALL ON SCHEMA public TO billbistro_owner;
GRANT USAGE ON SCHEMA public TO billbistro_app;
