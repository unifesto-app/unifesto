-- The WhatsApp group invite "send to everyone not yet invited" on every plan.
-- fee_live moved every space to General (STARTER), which had it off, so 58 of
-- 60 spaces could no longer reach attendees whose automatic invite was missed
-- (Meta rejected it, or they registered before the link was saved). It is
-- send-once per person at the utility rate, so the cost is bounded.
UPDATE "plan_configs"
   SET "has_whatsapp_blast" = true,
       "updated_at" = now()
 WHERE "plan" IN ('STARTER', 'CLUB');
