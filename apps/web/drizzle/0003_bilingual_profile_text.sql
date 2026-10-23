-- W7 (B4) bilingual profile text (lib/profile-text.ts; docs/PRODUCT.md «Bilingual profile text»). ADDITIVE ONLY: one
-- nullable jsonb per table, no default, so every row created before this migration keeps `translations` null and
-- renders exactly as before; both CHECKs accept NULL. Shape: { "<locale>": { "<field>": text | [text] } }, keyed by the
-- content locale that is NOT the profile's primary `locale`; zod bounds every field, the CHECK bounds the whole value.
-- The cv_app runtime role already holds DML on both tables (0001 grants table privileges, which cover new columns);
-- the guarded grant at the end re-asserts it, idempotently, for databases created before 0001 ran.
ALTER TABLE "profile_items" ADD COLUMN "translations" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "translations" jsonb;--> statement-breakpoint
ALTER TABLE "profile_items" ADD CONSTRAINT "profile_items_translations_check" CHECK ("profile_items"."translations" is null or (jsonb_typeof("profile_items"."translations") = 'object' and octet_length("profile_items"."translations"::text) <= 65536));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_translations_check" CHECK ("profiles"."translations" is null or (jsonb_typeof("profiles"."translations") = 'object' and octet_length("profiles"."translations"::text) <= 65536));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cv_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profiles, profile_items TO cv_app;
  END IF;
END $$;
