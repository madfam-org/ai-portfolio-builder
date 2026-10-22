CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_sub" text NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"locale" text DEFAULT 'es-MX' NOT NULL,
	"template" text DEFAULT 'base' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_token" text,
	"slug" text,
	"content" jsonb NOT NULL,
	"indexable" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_id_owner_sub_unique" UNIQUE("id","owner_sub"),
	CONSTRAINT "artifacts_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "artifacts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind" in ('cv', 'portfolio', 'presentation', 'cover_letter')),
	CONSTRAINT "artifacts_status_check" CHECK ("artifacts"."status" in ('draft', 'ready', 'published')),
	CONSTRAINT "artifacts_visibility_check" CHECK ("artifacts"."visibility" in ('private', 'link', 'public')),
	CONSTRAINT "artifacts_locale_check" CHECK ("artifacts"."locale" in ('es-MX', 'en')),
	CONSTRAINT "artifacts_link_token_check" CHECK (("artifacts"."visibility" = 'link') = ("artifacts"."share_token" is not null)),
	CONSTRAINT "artifacts_public_slug_check" CHECK (("artifacts"."visibility" = 'public') = ("artifacts"."slug" is not null)),
	CONSTRAINT "artifacts_indexable_public_check" CHECK (not "artifacts"."indexable" or "artifacts"."visibility" = 'public'),
	CONSTRAINT "artifacts_shared_published_check" CHECK (("artifacts"."visibility" = 'private') = ("artifacts"."status" <> 'published') and ("artifacts"."status" <> 'published' or "artifacts"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_sub" text NOT NULL,
	"title" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"source_url" text,
	"source_text" text NOT NULL,
	"parsed" jsonb,
	"status" text DEFAULT 'saved' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_id_owner_sub_unique" UNIQUE("id","owner_sub"),
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('saved', 'applying', 'applied', 'interview', 'offer', 'rejected', 'archived')),
	CONSTRAINT "jobs_source_text_size_check" CHECK (char_length("jobs"."source_text") between 1 and 50000)
);
--> statement-breakpoint
CREATE TABLE "profile_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_sub" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_items_id_owner_sub_unique" UNIQUE("id","owner_sub"),
	CONSTRAINT "profile_items_kind_check" CHECK ("profile_items"."kind" in ('experience', 'education', 'skill', 'project', 'certification', 'achievement', 'language', 'publication', 'volunteering', 'award', 'link'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_sub" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'es-MX' NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_owner_sub_unique" UNIQUE("owner_sub"),
	CONSTRAINT "profiles_id_owner_sub_unique" UNIQUE("id","owner_sub"),
	CONSTRAINT "profiles_locale_check" CHECK ("profiles"."locale" in ('es-MX', 'en'))
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_job_owner_fk" FOREIGN KEY ("job_id","owner_sub") REFERENCES "public"."jobs"("id","owner_sub") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_items" ADD CONSTRAINT "profile_items_profile_owner_fk" FOREIGN KEY ("profile_id","owner_sub") REFERENCES "public"."profiles"("id","owner_sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_owner_job_idx" ON "artifacts" USING btree ("owner_sub","job_id");--> statement-breakpoint
CREATE INDEX "jobs_owner_sub_idx" ON "jobs" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "profile_items_owner_profile_idx" ON "profile_items" USING btree ("owner_sub","profile_id");