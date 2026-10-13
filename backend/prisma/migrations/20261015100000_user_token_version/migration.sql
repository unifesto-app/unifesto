-- S6: per-user token version. Tokens carry it as `tv`; bumping it revokes
-- every session of the user. Default 0 matches tokens issued before this
-- column existed (no `tv` claim is read as 0), so nobody is logged out.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
