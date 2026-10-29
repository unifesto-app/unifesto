-- K3: scheduled publish for drafts, and old slugs that keep redirecting after a rename.
ALTER TABLE "blog_posts" ADD COLUMN "scheduled_for" TIMESTAMPTZ(6);
ALTER TABLE "blog_posts" ADD COLUMN "previous_slugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
