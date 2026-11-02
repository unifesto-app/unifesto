-- S64 / T2: Curator is an event-scoped role, so its space:manage-email and
-- space:manage-sponsors grants never matched a SPACE-scoped check (403 on Email,
-- Sponsors and Leads). The owner chose to drop them rather than resolve them
-- through the curator's events: space email, sponsors and leads stay with Space
-- Admins. Remove the rows so the IAM matrix stops promising access it never gave.
DELETE FROM "role_capabilities"
WHERE "role_code" = 'CURATOR'
  AND "action" IN ('space:manage-email', 'space:manage-sponsors');

DELETE FROM "space_role_capabilities"
WHERE "role_code" = 'CURATOR'
  AND "action" IN ('space:manage-email', 'space:manage-sponsors');
