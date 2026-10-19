-- D20: the requester's optional comment with their 1-5 rating.
ALTER TABLE "support_tickets" ADD COLUMN "rating_comment" VARCHAR(1000);
