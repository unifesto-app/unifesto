-- Q40: our own UPI-first checkout, switched per platform. Off falls back to
-- Razorpay Standard Checkout without a release. Additive only.
ALTER TABLE "platform_config" ADD COLUMN "upi_checkout_ios" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_config" ADD COLUMN "upi_checkout_android" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_config" ADD COLUMN "upi_checkout_web" BOOLEAN NOT NULL DEFAULT false;
