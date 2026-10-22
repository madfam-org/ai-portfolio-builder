-- Least-privilege runtime role (Enclii onboarding `--app-role cv_app`). Enclii grants that role CONNECT only and
-- leaves table grants to the application's own migrations (switchyard-api provisioning/postgres.go EnsureAppRole).
-- The migrations run as the database owner (DATABASE_URL); the app runs as cv_app (APP_DATABASE_URL): DML only,
-- never DDL. Guarded so a database without the role (local development, CI) migrates the same way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cv_app') THEN
    GRANT USAGE ON SCHEMA public TO cv_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cv_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cv_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cv_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cv_app;
  END IF;
END $$;
