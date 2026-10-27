-- contract-step: drops the Free / Revenue-share billing-model storage that the
-- plan lineup (#396) retired. #396 shipped the expand half on 2026-10-26 and
-- nothing reads these since; ships in its own deploy (ALLOW_DESTRUCTIVE=1).
ALTER TABLE "org_subscriptions" DROP COLUMN "billing_model";
ALTER TABLE "org_subscriptions" DROP COLUMN "revenue_share_percent";
DROP TABLE "billing_model_configs";
DROP TYPE "billing_model";
