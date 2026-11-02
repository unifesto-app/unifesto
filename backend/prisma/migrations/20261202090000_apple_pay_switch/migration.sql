-- Q40: Apple Pay on the iPhone pay page. Off until Razorpay holds the Apple Pay
-- certificate for merchant.com.unifesto.app. Additive only.
ALTER TABLE "platform_config" ADD COLUMN "apple_pay_ios" BOOLEAN NOT NULL DEFAULT false;
