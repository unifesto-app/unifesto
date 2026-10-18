-- D3: unread badges compare last_message_at with each side's last read.
-- Existing cases: whoever wrote last has read the thread; the other side
-- stays unread (a desk with no reply yet still shows the case as new).
UPDATE "support_tickets" t
SET "desk_last_read_at" = t."last_message_at"
WHERE t."desk_last_read_at" IS NULL
  AND (SELECT m."is_staff_reply" FROM "support_messages" m
       WHERE m."ticket_id" = t."id" ORDER BY m."created_at" DESC LIMIT 1);

UPDATE "support_tickets" t
SET "requester_last_read_at" = t."last_message_at"
WHERE t."requester_last_read_at" IS NULL
  AND NOT COALESCE((SELECT m."is_staff_reply" FROM "support_messages" m
       WHERE m."ticket_id" = t."id" ORDER BY m."created_at" DESC LIMIT 1), false);
