-- Unifesto Orbit was renamed Unifesto Encore (14 Nov 2026). Blog questions not yet
-- written that point at /orbit would fail the writer's link check (APP_PAGES now has
-- /encore/apply) and carry the old name into the post. Data only; no schema change.
UPDATE "blog_questions"
SET "app_link" = CASE WHEN "app_link" = '/orbit' THEN '/encore/apply' ELSE "app_link" END,
    "angle" = replace("angle", 'Orbit', 'Encore'),
    "updated_at" = now()
WHERE "status" IN ('QUEUED', 'FAILED')
  AND ("app_link" = '/orbit' OR "angle" LIKE '%Orbit%');
