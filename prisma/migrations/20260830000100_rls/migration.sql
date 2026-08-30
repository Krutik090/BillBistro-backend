-- Row-Level Security for every tenant table.
-- Context is a per-transaction GUC:  SELECT set_config('app.tenant_id', '<uuid>', true)
-- A second GUC app.bypass_rls = 'on' is reserved for system paths (login tenant lookup, seeding).
-- The API connects as role billbistro_app (created by infra/postgres/init.sql), which is NOT the
-- table owner, so policies apply. FORCE ROW LEVEL SECURITY makes them apply to the owner as well.

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on'
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','outlets','users','roles','role_permissions','user_roles','refresh_tokens',
    'menu_categories','menu_items','menu_variants','menu_modifiers',
    'orders','order_items','kots','bills','payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app_rls_bypass() OR tenant_id = app_current_tenant()) WITH CHECK (app_rls_bypass() OR tenant_id = app_current_tenant())',
      t);
  END LOOP;
END $$;

-- permissions is a platform catalogue: readable by everyone, writable only via migrations/seed (bypass).
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_read ON permissions;
CREATE POLICY permissions_read  ON permissions FOR SELECT USING (true);
DROP POLICY IF EXISTS permissions_write ON permissions;
CREATE POLICY permissions_write ON permissions FOR ALL USING (app_rls_bypass()) WITH CHECK (app_rls_bypass());

-- Grants for the runtime app role (the role itself is created by infra/postgres/init.sql).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'billbistro_app') THEN
    GRANT USAGE ON SCHEMA public TO billbistro_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO billbistro_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO billbistro_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO billbistro_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO billbistro_app;
  END IF;
END $$;
