-- CreateEnum
CREATE TYPE "BlogQuestionStatus" AS ENUM ('QUEUED', 'WRITING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "BlogQuestionSource" AS ENUM ('SEED', 'REFILL', 'SEARCH_CONSOLE');

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "cover_alt" TEXT,
ADD COLUMN     "meta_description" VARCHAR(155),
ADD COLUMN     "meta_title" VARCHAR(60);

-- CreateTable
CREATE TABLE "blog_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "intent" VARCHAR(20) NOT NULL,
    "angle" TEXT,
    "app_link" VARCHAR(200),
    "status" "BlogQuestionStatus" NOT NULL DEFAULT 'QUEUED',
    "source" "BlogQuestionSource" NOT NULL DEFAULT 'SEED',
    "fail_reason" TEXT,
    "post_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blog_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_questions_status_created_at_idx" ON "blog_questions"("status", "created_at");

-- AddForeignKey
ALTER TABLE "blog_questions" ADD CONSTRAINT "blog_questions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed: the 50 approved launch questions, in queue order (oldest first).
INSERT INTO "blog_questions" ("question", "topic", "intent", "angle", "app_link", "created_at", "updated_at") VALUES
  ('How do I get sponsors for a college fest as a new club?', 'sponsors', 'how-to', 'Sponsor roster, sponsor portal and booth-scan lead capture let a club show sponsors the leads they got (Pro).', '/organisers', now() + interval '0 seconds', now()),
  ('How much should we charge for college fest tickets?', 'ticket-pricing', 'explain', 'Multiple ticket types with sale windows, so early bird and on-the-day prices run side by side.', '/pricing', now() + interval '1 seconds', now()),
  ('Is it legal to collect event fees on a personal UPI ID?', 'upi-collection', 'explain', 'Paid tickets go through Razorpay checkout and pay out to the Space''s verified bank account instead of a member''s personal UPI.', '/organisers', now() + interval '2 seconds', now()),
  ('How do I write a sponsorship proposal for a college event?', 'sponsors', 'how-to', 'Sponsor lead capture and PDF event reports give a proposal real numbers from past events (Pro).', NULL, now() + interval '3 seconds', now()),
  ('How do I get permission from my college to conduct an event?', 'college-permission', 'how-to', 'Unifesto Orbit puts one Orbit Lead on each campus to help clubs run events; the approval itself stays with the college.', '/orbit', now() + interval '4 seconds', now()),
  ('How do I check in 2,000 people at an event without long queues?', 'check-in', 'how-to', 'Every registration gets a QR pass; Crew scan from the app at multiple check-in points with a duplicate guard and a live count.', '/organisers', now() + interval '5 seconds', now()),
  ('How do I reduce no-shows for a free college event?', 'no-shows', 'how-to', 'Push reminders, WhatsApp confirmations and waitlists (Pro) that fill dropped seats.', '/organisers', now() + interval '6 seconds', now()),
  ('How many volunteers do I need for a college fest?', 'volunteers', 'explain', 'The Crew role, scoped to the check-in points each volunteer staffs.', NULL, now() + interval '7 seconds', now()),
  ('How do I make a budget for a college fest?', 'fest-budget', 'how-to', 'Per-event financials (collected, fees, refunds, net) to check the budget against.', NULL, now() + interval '8 seconds', now()),
  ('How do I promote a college event on Instagram with no budget?', 'instagram-promotion', 'how-to', 'Tracked short links and UTM sources show which post brought registrations.', '/organisers', now() + interval '9 seconds', now()),
  ('How do I handle registrations from other colleges for an inter-college event?', 'inter-college', 'how-to', 'Custom registration questions with show-if logic and file uploads, such as college name and ID card.', '/organisers', now() + interval '10 seconds', now()),
  ('How do I send certificates to 500 participants at once?', 'certificates', 'how-to', 'Batch certificates from the Space''s own template (Pro).', '/organisers', now() + interval '11 seconds', now()),
  ('How do I issue e-certificates that anyone can verify?', 'certificates', 'explain', 'Every certificate has public online verification (Pro).', '/organisers', now() + interval '12 seconds', now()),
  ('How do refunds work when a college event gets cancelled?', 'refunds', 'explain', 'Refunds need the right approval before any money moves; refunds cover the ticket price.', '/pricing', now() + interval '13 seconds', now()),
  ('How do I start a club in college in India?', 'start-club', 'how-to', 'A Space for the club with roles: Space Admin, Curator, Co-Curator and Crew.', '/request-space', now() + interval '14 seconds', now()),
  ('How do I hand over a college club to next year''s team without losing everything?', 'club-handover', 'how-to', 'The Space keeps events, people, money and history when the team changes; ownership can be transferred.', '/request-space', now() + interval '15 seconds', now()),
  ('How do I manage group registrations where one person pays for the whole team?', 'group-registration', 'how-to', 'Group tickets: the lead pays for seats and teammates claim theirs by invite link.', '/organisers', now() + interval '16 seconds', now()),
  ('Do student clubs need to charge GST on event tickets?', 'gst', 'explain', NULL, NULL, now() + interval '17 seconds', now()),
  ('How do I organise a paid workshop with an outside speaker?', 'paid-workshop', 'how-to', 'A paid ticket type with a capacity cap, or Unifesto Huddle if the speaker joins online (Pro).', '/huddle', now() + interval '18 seconds', now()),
  ('How do I arrange accommodation for outstation fest participants?', 'accommodation', 'how-to', 'Unifesto Stay: room options, team approval, and a Stay Pass scanned at arrival.', '/stay', now() + interval '19 seconds', now()),
  ('How do I run online sessions for my college club?', 'online-sessions', 'how-to', 'Unifesto Huddle hosts online sessions inside the app (Pro).', '/huddle', now() + interval '20 seconds', now()),
  ('How do I book an artist for a college pro-show?', 'pro-show', 'how-to', NULL, NULL, now() + interval '21 seconds', now()),
  ('How do I run a waitlist for a sold-out event?', 'waitlist', 'how-to', 'Waitlists hold an offered seat until the person pays to claim it (Pro).', '/organisers', now() + interval '22 seconds', now()),
  ('How do I set up early bird pricing and discount codes for an event?', 'discount-codes', 'how-to', 'Coupons plus ticket sale windows for early bird pricing.', '/pricing', now() + interval '23 seconds', now()),
  ('How do I measure whether our college event was a success?', 'event-success', 'explain', 'Attendance analytics and formatted PDF event reports (Pro).', '/organisers', now() + interval '24 seconds', now()),
  ('How do I organise a hackathon in college?', 'hackathon-organise', 'how-to', 'Unifesto Sprint runs teams, problem statements, weighted judging rounds, a room help desk, leaderboard and certificates (Pro).', '/sprint', now() + interval '25 seconds', now()),
  ('How many judges do I need for a hackathon?', 'hackathon-judging', 'explain', 'Sprint judge panels and round-by-round evaluation.', '/sprint', now() + interval '26 seconds', now()),
  ('What judging criteria should a hackathon use?', 'hackathon-judging', 'explain', 'Sprint rubrics with weighted criteria and a live leaderboard.', '/sprint', now() + interval '27 seconds', now()),
  ('How do I find mentors for a college hackathon?', 'hackathon-mentors', 'how-to', 'Sprint help desk topics, each with a named point of contact.', '/sprint', now() + interval '28 seconds', now()),
  ('How do I write good hackathon problem statements?', 'problem-statements', 'how-to', 'Teams pick a problem statement or theme when they register in Sprint.', '/sprint', now() + interval '29 seconds', now()),
  ('How do I run a Smart India Hackathon internal round in my college?', 'sih-internal', 'how-to', 'Sprint team registration with custom questions to collect team details; SIH''s team-size and gender rules still need a manual check.', '/sprint', now() + interval '30 seconds', now()),
  ('24-hour vs 36-hour hackathon: which is better for a first event?', 'hackathon-duration', 'compare', 'Mostly opinion; Sprint rooms and help desk matter on the day.', NULL, now() + interval '31 seconds', now()),
  ('How do I get sponsors for a student hackathon?', 'sponsors', 'how-to', 'Sponsor roster and sponsor portal (Pro).', '/organisers', now() + interval '32 seconds', now()),
  ('How do I stop teams submitting pre-built projects at a hackathon?', 'hackathon-cheating', 'how-to', 'In-app submissions and round-by-round judging in Sprint.', '/sprint', now() + interval '33 seconds', now()),
  ('Devfolio vs Unstop vs Unifesto: which is best for hosting a hackathon?', 'hackathon-platforms', 'compare', 'Be honest: Devfolio and Unstop have larger hacker communities and discovery; Unifesto runs the hackathon itself plus check-in, money and certificates.', '/sprint', now() + interval '34 seconds', now()),
  ('How do I find a hackathon team as a beginner?', 'hackathon-team', 'how-to', 'In the app a lead can buy seats for the whole team and invite teammates by link.', '/app', now() + interval '35 seconds', now()),
  ('What should I bring to a 24-hour hackathon?', 'hackathon-prep', 'explain', 'The pass lives in the app''s Tickets tab.', NULL, now() + interval '36 seconds', now()),
  ('How do beginners win their first hackathon? (reddit)', 'hackathon-prep', 'how-to', 'Teams follow their hackathon and the leaderboard in the app.', NULL, now() + interval '37 seconds', now()),
  ('How do I find college fests and events in Hyderabad?', 'hyderabad-events', 'how-to', 'The app''s events feed by category and date, and following Spaces.', '/events', now() + interval '38 seconds', now()),
  ('Are college fest tickets refundable?', 'refunds', 'explain', 'Depends on the organiser; refunds run through the platform with approval.', '/app', now() + interval '39 seconds', now()),
  ('How do I transfer my event ticket to a friend?', 'ticket-transfer', 'how-to', 'The organiser moves a registration to another account by email; the attendee asks the organiser.', '/app', now() + interval '40 seconds', now()),
  ('Is it worth attending college fests at other colleges? (reddit)', 'other-college-fests', 'explain', 'Public events from other campuses on the events page.', '/events', now() + interval '41 seconds', now()),
  ('Where do students find tech meetups in Hyderabad?', 'hyderabad-events', 'explain', 'Following Spaces and the events feed.', '/spaces', now() + interval '42 seconds', now()),
  ('What is the best event management platform for college clubs in India?', 'event-platforms', 'compare', 'Spaces and roles, tickets, check-in, money and certificates in one place.', '/organisers', now() + interval '43 seconds', now()),
  ('Unstop vs KonfHub vs Unifesto: which is better for college events?', 'event-platforms', 'compare', 'Be honest: KonfHub has quizzes, polls and Q&A, which Unifesto does not; Unifesto has Spaces, hackathons and financials.', '/pricing', now() + interval '44 seconds', now()),
  ('Luma vs Unifesto: which works better for Indian events that need UPI?', 'event-platforms', 'compare', 'Razorpay with INR and UPI; Luma''s strength is global reach.', '/pricing', now() + interval '45 seconds', now()),
  ('Which Eventbrite alternatives in India support UPI payments?', 'event-platforms', 'compare', 'Razorpay checkout; free RSVP events carry no platform fee.', '/pricing', now() + interval '46 seconds', now()),
  ('How do I send WhatsApp updates to 1,000 event registrants without getting banned?', 'whatsapp-updates', 'how-to', 'WhatsApp confirmations and group invite links on every plan, WhatsApp blasts on Pro.', '/organisers', now() + interval '47 seconds', now()),
  ('What does the DPDP Act mean for college event organisers?', 'attendee-data', 'explain', 'Crew access is scoped to what each person needs; data rights pages exist.', NULL, now() + interval '48 seconds', now()),
  ('How do I export attendee data safely?', 'attendee-data', 'how-to', 'Bulk attendee export (Pro) and CSV financials.', '/organisers', now() + interval '49 seconds', now());
