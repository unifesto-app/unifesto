-- H25: ownership TXT token for custom web domains. Additive and nullable.
ALTER TABLE "space_domains" ADD COLUMN "verify_token" VARCHAR(64);
