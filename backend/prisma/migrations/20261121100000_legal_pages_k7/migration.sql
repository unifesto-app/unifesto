-- K7: the last six legal pages move from web code into Apex-managed legal
-- documents (I2). Each v1 row is the text already live on unifesto.app,
-- moved unchanged, and dated 6 October 2026 like the page it replaces, so the
-- effective date readers see does not change. Wording changes need a lawyer's
-- sign-off and go through Apex (Legal documents) as new versions.
-- ON CONFLICT: never overwrite a version someone already created in Apex.

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('code-of-conduct', 1, 'Code of Conduct', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## For everyone {#everyone}

Unifesto is for people coming together. Wherever you meet through it, online or at the venue:

- Treat people with respect. No harassment, bullying, threats or intimidation.
- No discrimination on grounds of gender, caste, religion, ethnicity, disability, sexual orientation, age or background.
- No unwelcome sexual attention, comments or contact, and no photographing or recording people who do not want it.
- No spam, scams, impersonation or fake events and accounts.
- Respect privacy: do not share other people’s contact details, passes or registration data.
- Follow the law, the venue’s rules, and the event team’s safety instructions.

## Organisers and their teams {#organisers}

- Describe your event honestly, including price, venue, dates and what is included.
- Make the event safe and accessible, with a way for people to raise concerns on the day.
- Use attendee data only to run your event. Never sell it or add people to unrelated lists.
- Act on reports of misconduct at your event and tell us about serious incidents.
- Make sure your crew, volunteers and co-hosts follow this Code.

## Hackathon judges, mentors and participants {#hackathons}

- Judges score fairly against the published rubric and declare any conflict of interest.
- Mentors and volunteers help every team equally and keep team work confidential.
- Participants submit their own team’s work and follow the hackathon’s rules on prior work and outside help.

## Sponsors {#sponsors}

Collect leads only when an attendee chooses to share them, by letting you scan their pass or sending you an enquiry. Do not pressure attendees, and contact them only about what they showed interest in.

## Reporting a problem {#report}

- **In danger?** Call 112 first, then tell the event team.
- **At an event:** tell the organiser or volunteers on site.
- **In the app:** use **Report** on the event or Space.
- **Anything else:** write to [grievance@unifesto.app](mailto:grievance@unifesto.app). We keep reports confidential and do not tolerate retaliation against people who report in good faith.

## What happens if someone breaks this Code {#enforcement}

Organisers may remove someone from their event without a refund. Unifesto may remove content, unpublish events, restrict or close accounts or Spaces, withhold payouts tied to fraud, and report unlawful conduct to the authorities. We look at what happened and its seriousness, and you can contest our decision through the [Grievance Redressal Policy](/grievance).
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('privacy-notice', 1, 'Privacy Notice', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Who is asking {#who}

Unifesto Private Limited (“Unifesto”) is the Data Fiduciary for the personal data you give us to use the Unifesto website, app and Space console. When you register for an event, the organiser of that event also receives your registration details to run it.

## What we ask for and why {#data}

| Personal data | Used for |
| --- | --- |
| Mobile number or email | Creating your account and signing you in with a one-time code |
| Name, username, gender, photo, bio, social links | Your profile, your passes and certificates, and what organisers see when you register |
| Registration answers, uploaded files, team members | Registering you for an event, as the organiser asked |
| Guest details and photo ID (stays only) | Booking event accommodation and checking guests in |
| Payment and refund references (never card or UPI details) | Taking payment, refunding, and keeping records the law requires |
| City (optional, from your device location) | Showing events near you |
| App version, push subscription, crash reports, screens used | Sending notifications you turn on, and keeping the app working |

We use it only for these purposes. We do not sell it or share it with advertisers. The full list of who processes it for us is on the [Subprocessor List](/subprocessors).

## Withdrawing consent {#withdraw}

Withdrawing consent is as easy as giving it:

- turn off notifications, campaigns or location in the app’s settings or your device settings;
- [delete your account](/delete-account) from the app; or
- write to [privacy@unifesto.app](mailto:privacy@unifesto.app).

After you withdraw, we stop the processing that relied on that consent, unless the law requires us to keep something (for example payment records). Processing already done stays lawful.

## Your rights {#rights}

You can ask for a summary of your data, correct or erase it, nominate someone to act for you, and have complaints addressed. Use the [Privacy Request Center](/privacy-requests); the [Data Principal Rights Policy](/data-rights) explains how we handle each request.

## Complaints {#complain}

Contact our Grievance Officer, **Vinay Buddolla**, at [grievance@unifesto.app](mailto:grievance@unifesto.app). If you are not satisfied with our response, you can complain to the Data Protection Board of India. See the [Grievance Redressal Policy](/grievance).
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('data-rights', 1, 'Data Principal Rights Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Your rights {#rights}

As a Data Principal under the Digital Personal Data Protection Act, 2023 you have the right to:

- **Access:** a summary of the personal data we hold about you, what we do with it, and who we have shared it with (organisers of events you registered for, and our [subprocessors](/subprocessors)).
- **Correction and completion:** fix inaccurate or incomplete data and update it. Most profile details you can edit yourself in the app.
- **Erasure:** have data erased when it is no longer needed for the purpose you gave it for, or when you withdraw consent.
- **Withdraw consent** at any time, as easily as you gave it.
- **Nominate** a person to exercise these rights for you if you die or become incapable.
- **Grievance redressal:** have your complaints answered, and then go to the Data Protection Board of India if you are not satisfied.

## Who can make a request {#who}

- You, for your own data.
- A parent or lawful guardian, for a child or a person with a disability under their care.
- Your nominee, with proof of death or incapacity.
- Someone you authorise in writing, with your consent and their identity.

## Verifying it is you {#verification}

To protect your data from people pretending to be you, send requests from the email or phone number on your account. If that is not possible, we may ask you to confirm a one-time code or give details only the account holder would know. We ask for no more than we need, and we never ask for your password or payment details.

## How fast we respond {#timelines}

- We acknowledge every request within **48 hours**.
- We complete access, correction and consent requests within **15 days**, and erasure within **30 days** (account deletion has a 30-day grace period you can cancel).
- If we need longer, we tell you why and when, and never exceed the 90 days the DPDP Rules allow.
- Requests are free.

## When we cannot do everything you ask {#limits}

We will explain any part of a request we cannot complete. The usual reasons are:

- the law requires us to keep it, for example payment, refund, payout and tax records (kept up to eight years, without your contact details once your account is closed);
- it is needed to resolve an open dispute, refund or fraud investigation;
- it is also another person’s data, such as a team registration, where we limit what we share or erase to protect them;
- we cannot verify the request.

Data an organiser already received for an event they ran is held by that organiser too. On request, we pass your erasure or correction to them and remove what we hold on our side.

## Your duties {#duties}

The DPDP Act also asks Data Principals not to impersonate others, not to suppress material information, and not to file false or frivolous complaints. Please give accurate information when you make a request.

## Making a request {#how}

Use the [Privacy Request Center](/privacy-requests), or write to [privacy@unifesto.app](mailto:privacy@unifesto.app). If you are unhappy with how we handled it, contact the Grievance Officer, Vinay Buddolla, at [grievance@unifesto.app](mailto:grievance@unifesto.app) (see the [Grievance Redressal Policy](/grievance)).
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('privacy-requests', 1, 'Privacy Request Center', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Do it yourself in the app {#self-serve}

- **Correct your profile:** Profile → Edit profile.
- **Turn off notifications or campaigns:** Profile → Notifications.
- **Turn off location, camera or other access:** Profile → Permissions, or your device settings.
- **Delete your account:** Profile → Account settings → Delete account (see [Delete your account](/delete-account)).

## Send us a request {#request}

Pick a request below. It opens an email to privacy@unifesto.app with the details we need. Send it from the email on your account so we can verify you quickly.

<!-- slot:requests -->

Making a request for someone else (a child, a person in your care, or as a nominee)? Say so in the email and we will tell you what proof we need.

## What happens next {#next}

1. We acknowledge your request within 48 hours.
2. We may ask you to confirm it is you.
3. We complete it within 15 days (30 for erasure) and tell you what we did, or explain anything we could not do.

## Not happy with the answer? {#help}

Contact the Grievance Officer, Vinay Buddolla, at [grievance@unifesto.app](mailto:grievance@unifesto.app). The [Data Principal Rights Policy](/data-rights) explains your rights and our process in full.
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('subprocessors', 1, 'Subprocessor List', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Current subprocessors {#list}

These providers process personal data for Unifesto under contract, only to deliver the Services and only on our instructions.

| Provider | Purpose | Location |
| --- | --- | --- |
| Amazon Web Services | Hosting, database, file storage and transactional email (SES) | India (Mumbai region) |
| Razorpay | Ticket and stay payments, refunds | India |
| Meta (WhatsApp Business Platform) | Sign-in codes, registration confirmations, group invite links, messages you send us | Global |
| Resend | Transactional and campaign email | United States |
| OneSignal | Push notifications | United States |
| Google Firebase | App analytics and crash reports | Global |
| Google and Apple | Sign in with Google and Sign in with Apple | Global |
| LiveKit | Audio and video for live online sessions | Global |
| Google Maps Platform | Venue search and event maps | Global |

## Organisers are not subprocessors {#organisers}

When you register for an event, the Space that runs it receives your registration details to run that event. Organisers decide how they use those details for their event, under our [Terms](/terms#organisers), and are not listed here.

## Safeguards {#safeguards}

- Our main servers, database and file storage are in India (AWS Mumbai).
- Providers outside India receive only what their purpose needs, under contracts that require them to protect it, and as the DPDP Act permits.
- We review a provider before adding it and remove access when we stop using it.

## Changes {#changes}

We update this page before a new subprocessor starts processing personal data. Organisers who want notice of changes, or anyone with questions, can write to [privacy@unifesto.app](mailto:privacy@unifesto.app).
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('security', 1, 'Responsible Disclosure Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Reporting a vulnerability {#report}

If you think you have found a security issue in Unifesto, email [security@unifesto.app](mailto:security@unifesto.app) with:

- what the issue is and where (URL, endpoint, app screen and version);
- steps to reproduce it, and a proof of concept if you have one;
- the impact you think it has;
- how to reach you, and whether you would like to be credited.

## In scope {#scope}

- unifesto.app and its subdomains, including space.unifesto.app and the Unifesto API;
- the Unifesto app for iOS and Android.

## Out of scope {#out-of-scope}

- Services we use but do not run (Razorpay, AWS, Google, Apple, Meta, OneSignal and others). Report those to the provider.
- Denial of service, load or spam testing, and social engineering or phishing of our team or users.
- Physical attacks on offices or event venues.
- Missing best-practice headers, clickjacking on pages with no sensitive action, self-XSS, or rate limits without demonstrated impact.
- Reports from automated scanners without a working proof of concept.

## Testing rules {#rules}

- Use only accounts you own or have permission to use. Do not access, change or delete other people’s data; if you reach any, stop, and include only what is needed to show the issue.
- Do not make real payments or refunds to test, or disrupt live events.
- Give us reasonable time to fix the issue before telling anyone else, and do not share it publicly until we confirm it is fixed.

## Our commitment {#commitment}

- We acknowledge your report within 3 working days and keep you updated until it is fixed.
- If you follow this policy in good faith, we will not take legal action against you for your research, and we will treat it as authorised.
- With your permission, we credit you once the issue is fixed.

## Rewards {#rewards}

We do not run a paid bug bounty at this time. We are grateful for every valid report and say so publicly if you would like.
$md$, E'\n'))
ON CONFLICT ("slug", "version") DO NOTHING;
