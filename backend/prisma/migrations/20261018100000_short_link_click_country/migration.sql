-- K5: country of each short link click (Cloudflare Cf-Ipcountry).
ALTER TABLE "short_link_clicks" ADD COLUMN "country" VARCHAR(2);
