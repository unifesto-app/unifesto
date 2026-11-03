-- CreateTable
CREATE TABLE "wegobeyond_docs" (
    "name" VARCHAR(32) NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wegobeyond_docs_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "wegobeyond_crew_signups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "organization" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[],
    "availability" TEXT[],
    "experience" TEXT NOT NULL DEFAULT '',
    "links" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wegobeyond_crew_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wegobeyond_crew_signups_created_at_idx" ON "wegobeyond_crew_signups"("created_at");

-- Seed: the site's content as it stood in ~/Startups/Beyond/content/*.json when
-- the admin moved here (4 Nov 2026), normalised by wegobeyond.schema.ts. From now
-- on Apex › WeGoBeyond is the only editor.
INSERT INTO "wegobeyond_docs" ("name", "data") VALUES
('initiatives', $json${
  "initiatives": [
    {
      "name": "Build with AIA",
      "slug": "build-with-aia",
      "note": "Workshop",
      "body": "AI agents, built hands-on in one afternoon.",
      "intro": "A hands-on afternoon on AI agents. Learn how they work, then build one that completes a multi-step task, and demo it.",
      "agenda": [
        "What makes an AI agent: tools, memory and planning",
        "Function calling and connecting APIs",
        "Hands-on: build an agent that completes a multi-step task",
        "Reliability, testing and cost control",
        "Demo showcase, with a prize for the best build"
      ],
      "audience": "Developers, students and tech professionals. Bring a laptop.",
      "match": [
        "build with aia",
        "build-with-aia"
      ]
    },
    {
      "name": "LinkedIn Workshop & Meetup",
      "slug": "linkedin-workshop-meetup",
      "note": "With LinkedInspire",
      "body": "Rewrite your profile live, then meet recruiters.",
      "intro": "A workshop on standing out on LinkedIn, run with LinkedInspire, followed by an open meetup with recruiters and professionals.",
      "agenda": [
        "Profile makeover: headline, about section, banner and featured",
        "Content that gets reach: hooks, post formats and consistency",
        "Networking: connection requests and messages that get replies",
        "Hands-on: rewrite your own profile with live feedback",
        "Meetup: open networking with recruiters and professionals"
      ],
      "audience": "Students, job-seekers, professionals, freelancers and founders. Bring a laptop or phone.",
      "match": [
        "linkedin workshop",
        "linkedinspire"
      ]
    },
    {
      "name": "StartupCulture",
      "slug": "startupculture",
      "note": "Talks and pitches",
      "body": "Real founders, real stories, and your idea pitched live.",
      "intro": "Founders talk about how they really started, a panel takes on startup versus corporate life, and teams pitch their ideas live.",
      "agenda": [
        "Founder talks: how they started, early mistakes, real startup culture",
        "Panel: startup vs corporate careers, hiring and work-life reality",
        "Pitch workshop: three minutes per team, live founder feedback and a prize",
        "Networking between founders, job-seekers and potential co-founders"
      ],
      "audience": "Founders, startup and idea-stage teams, and students.",
      "match": [
        "startupculture",
        "startup culture",
        "startup-culture"
      ]
    },
    {
      "name": "Café Coffee Cōnnect",
      "slug": "cafe-coffee-connect",
      "note": "Invite only",
      "body": "Café meetups for entrepreneurs, developers and creators.",
      "intro": "An invite-only café meetup series for entrepreneurs, developers and creators. Edition 01 is in Hyderabad in January 2027.",
      "agenda": [],
      "audience": "Entrepreneurs, developers and creators.",
      "match": [
        "café coffee",
        "cafe coffee",
        "coffee-connect",
        "coffee connect"
      ]
    },
    {
      "name": "Beyond Gaming",
      "slug": "beyond-gaming",
      "note": "In planning",
      "body": "Esports and gaming, starting with a campus tournament.",
      "intro": "Our esports and gaming segment. It starts with a Campus Edition: a tournament run across colleges in Hyderabad. Dates to be announced.",
      "agenda": [],
      "audience": "Players and college teams across Hyderabad.",
      "match": [
        "beyond gaming",
        "campus edition",
        "esports"
      ]
    },
    {
      "name": "VCPL",
      "slug": "vcpl",
      "note": "Coming soon",
      "body": "Details to be announced.",
      "intro": "Another WeGoBeyond initiative is on its way. Details to be announced.",
      "agenda": [],
      "audience": "",
      "match": [
        "vcpl"
      ]
    }
  ]
}$json$::jsonb),
('gallery', $json${
  "photos": []
}$json$::jsonb),
('team', $json${
  "members": []
}$json$::jsonb),
('press', $json${
  "boilerplate": "WeGoBeyond runs workshops, meetups and hackathons for people who build, in Hyderabad. It is an initiative of Unifesto, the events platform, and is run by Unifesto Private Limited.",
  "pressEmail": "partnerships@unifesto.app",
  "releases": [
    {
      "date": "2026-11-03",
      "title": "Café Coffee Cōnnect, a new invite-only series",
      "body": "An invite-only café meetup series for entrepreneurs, developers and creators. Edition 01 is in Hyderabad in January 2027."
    },
    {
      "date": "2026-11-03",
      "title": "WeGoBeyond’s December series in Hyderabad",
      "body": "Three Sunday afternoons: Build with AIA on 6 December, the LinkedIn Workshop & Meetup with LinkedInspire on 13 December, and StartupCulture on 20 December. Registration is on Unifesto."
    }
  ]
}$json$::jsonb),
('crew', $json${
  "intro": "Volunteer, speak, mentor or host. It takes a couple of minutes, and we’ll reach out when there’s a room to run.",
  "consent": "I agree to be contacted by the WeGoBeyond team about joining the crew, and for my details to be stored to coordinate.",
  "availability": [
    "Weekends",
    "Weekday evenings",
    "Remote"
  ],
  "roles": [
    "Student",
    "Working professional",
    "Founder",
    "Freelancer",
    "Other"
  ],
  "teams": [
    {
      "name": "Promotions & Marketing",
      "blurb": "Campaigns, campus drives and posts."
    },
    {
      "name": "Campus & Community Outreach",
      "blurb": "Bring colleges, clubs and communities in."
    },
    {
      "name": "Registration & Check-in",
      "blurb": "Front desk and first impressions."
    },
    {
      "name": "Logistics & Operations",
      "blurb": "Setup, supplies and keeping things moving."
    },
    {
      "name": "Speaking",
      "blurb": "Give a talk or join a panel."
    },
    {
      "name": "Mentoring",
      "blurb": "Help attendees and teams get unstuck."
    },
    {
      "name": "Social Media & Content",
      "blurb": "Live coverage, stories and updates."
    },
    {
      "name": "Photography & Video",
      "blurb": "Capture the room on camera."
    },
    {
      "name": "Design",
      "blurb": "Posters, signage and graphics."
    },
    {
      "name": "Hosting & Emcee",
      "blurb": "Run the stage and keep the energy up."
    }
  ]
}$json$::jsonb),
('settings', $json${
  "heroLead": "Workshops, meetups and hackathons for people who build.",
  "partnersInbox": "partnerships@unifesto.app",
  "supportInbox": "support@unifesto.app",
  "contacts": [
    {
      "role": "Partnerships",
      "addr": "partnerships@unifesto.app"
    },
    {
      "role": "Support",
      "addr": "support@unifesto.app"
    }
  ],
  "socials": [
    {
      "brand": "wegobeyond",
      "network": "instagram",
      "label": "Instagram",
      "href": "https://instagram.com/wego.beyond"
    },
    {
      "brand": "unifesto",
      "network": "instagram",
      "label": "Instagram",
      "href": "https://www.instagram.com/unifesto.app/"
    },
    {
      "brand": "unifesto",
      "network": "linkedin",
      "label": "LinkedIn",
      "href": "https://www.linkedin.com/company/unifesto"
    },
    {
      "brand": "unifesto",
      "network": "x",
      "label": "X",
      "href": "https://x.com/unifestoapp"
    },
    {
      "brand": "unifesto",
      "network": "youtube",
      "label": "YouTube",
      "href": "https://www.youtube.com/@unifesto-app"
    }
  ],
  "policies": [
    {
      "label": "Terms",
      "href": "https://unifesto.app/terms"
    },
    {
      "label": "Privacy",
      "href": "https://unifesto.app/privacy"
    },
    {
      "label": "Refunds",
      "href": "https://unifesto.app/refund"
    },
    {
      "label": "Code of conduct",
      "href": "https://unifesto.app/code-of-conduct"
    },
    {
      "label": "Grievance redressal",
      "href": "https://unifesto.app/grievance"
    }
  ]
}$json$::jsonb);
