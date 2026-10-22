-- W5-J job intake: typed posting fields on `jobs` (docs/PRODUCT.md "Job intake"). ADDITIVE ONLY: every new column is
-- nullable with no default, so rows created before this migration keep working unchanged, and every CHECK accepts NULL.
-- W5-H (HCM benchmarking) reads country_code, state_code and the salary_* columns; their meaning is fixed in
-- src/server/ingest/vocab.ts. The cv_app runtime role already holds DML on `jobs` (0001 grants table privileges, which
-- cover new columns); the guarded grant at the end re-asserts it, idempotently, for databases created before 0001 ran.
ALTER TABLE "jobs" ADD COLUMN "source_kind" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "work_mode" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_min" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_max" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_currency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_period" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "date_posted" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "valid_through" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_kind_check" CHECK ("jobs"."source_kind" is null or "jobs"."source_kind" in ('paste', 'url', 'ats', 'capture', 'pdf', 'docx', 'file'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_country_code_check" CHECK ("jobs"."country_code" is null or "jobs"."country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_state_code_check" CHECK ("jobs"."state_code" is null or "jobs"."state_code" ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$');--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employment_type_check" CHECK ("jobs"."employment_type" is null or "jobs"."employment_type" in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'volunteer', 'per_diem', 'other'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_work_mode_check" CHECK ("jobs"."work_mode" is null or "jobs"."work_mode" in ('onsite', 'hybrid', 'remote'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_currency_check" CHECK ("jobs"."salary_currency" is null or "jobs"."salary_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_period_check" CHECK ("jobs"."salary_period" is null or "jobs"."salary_period" in ('hour', 'day', 'week', 'month', 'year'));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_amounts_check" CHECK (("jobs"."salary_min" is null or "jobs"."salary_min" > 0) and ("jobs"."salary_max" is null or "jobs"."salary_max" > 0) and ("jobs"."salary_min" is null or "jobs"."salary_max" is null or "jobs"."salary_min" <= "jobs"."salary_max"));--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_unit_needs_amount_check" CHECK (("jobs"."salary_currency" is null and "jobs"."salary_period" is null) or "jobs"."salary_min" is not null or "jobs"."salary_max" is not null);--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cv_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jobs TO cv_app;
  END IF;
END $$;
