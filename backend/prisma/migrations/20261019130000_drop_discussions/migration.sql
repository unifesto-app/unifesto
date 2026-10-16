-- contract-step: 0.9 drops the discussions tables. No module or UI ever wrote to them;
-- the only readers (_count / analytics counts) are removed in the same PR.
DROP TABLE IF EXISTS "discussion_replies";
DROP TABLE IF EXISTS "discussions";
