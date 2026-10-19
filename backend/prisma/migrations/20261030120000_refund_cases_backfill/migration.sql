-- D6: every refund request is an Assist case. New ones open their own; this
-- gives each request still open today a case on the desk its stage belongs
-- to (PENDING_CURATOR = the event's space, the rest = Unifesto). Requests
-- raised from a case already live in it. Data only; safe to re-run.
WITH open_refunds AS (
  SELECT rr.id, rr.reason, rr.status, rr.event_id, rr.registration_id,
         rr.requester_role, rr.created_at, reg.user_id AS holder_id,
         e.space_id, e.title
  FROM refund_requests rr
  JOIN event_registrations reg ON reg.id = rr.registration_id
  JOIN events e ON e.id = rr.event_id
  WHERE rr.status IN ('PENDING_CURATOR', 'PENDING_ADMIN', 'PROCESSING', 'REFUND_FAILED')
    AND rr.support_ticket_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.subject_type = 'RefundRequest' AND t.subject_id = rr.id
    )
), cases AS (
  INSERT INTO support_tickets (
    subject, category, requester_id, kind, desk, space_id, event_id,
    registration_id, subject_type, subject_id, last_message_at,
    requester_last_read_at, created_at, updated_at
  )
  SELECT LEFT('Refund: ' || o.title, 300),
         'PAYMENTS'::support_ticket_category,
         o.holder_id,
         'REFUND'::support_case_kind,
         (CASE WHEN o.status = 'PENDING_CURATOR' THEN 'SPACE' ELSE 'PLATFORM' END)::support_desk,
         o.space_id, o.event_id, o.registration_id, 'RefundRequest', o.id,
         o.created_at, o.created_at, o.created_at, now()
  FROM open_refunds o
  RETURNING id, subject_id
)
INSERT INTO support_messages (ticket_id, author_id, is_staff_reply, side, body, created_at)
SELECT c.id,
       o.holder_id,
       o.requester_role <> 'ATTENDEE',
       (CASE WHEN o.requester_role = 'ATTENDEE' THEN 'REQUESTER' ELSE 'SYSTEM' END)::support_message_side,
       CASE WHEN o.requester_role = 'ATTENDEE' THEN o.reason
            ELSE 'Refund raised for the ticket holder. Reason: ' || o.reason END,
       o.created_at
FROM cases c
JOIN open_refunds o ON o.id = c.subject_id;
