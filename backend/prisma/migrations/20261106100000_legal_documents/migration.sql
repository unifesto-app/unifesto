-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "requires_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "client" VARCHAR(16) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_version_key" ON "legal_documents"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_user_id_document_id_key" ON "legal_acceptances"("user_id", "document_id");

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- I1/I2 seed. Published v1 rows are the text that was already live on
-- unifesto.app (moved from the web pages, unchanged), so nobody is asked to
-- re-accept on deploy. Every other row is an unpublished DRAFT: it needs a
-- lawyer's review, then an admin publishes it from Apex (Legal documents).

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('terms', 1, 'Terms of Service', NULL, false, TIMESTAMPTZ '2026-10-19 00:00:00+05:30', now(), btrim($md$
## Agreement {#agreement}

These Terms are a contract between you and Unifesto Private Limited (“Unifesto”, “we”) for using the Unifesto website, app and Space console (the “Services”). By creating an account or using the Services you agree to these Terms, our [Privacy Policy](/privacy), our [Refund and Cancellation Policy](/refund) and [Code of Conduct](/code-of-conduct). If you do not agree, do not use the Services.

You must be 18 or older, or use the Services with the consent of a parent or lawful guardian who accepts these Terms on your behalf. If you use the Services for a club, institution or company, you confirm you are allowed to bind it to these Terms.

## What Unifesto is, and is not {#role}

Unifesto provides the tools organisers use to publish and run events, and attendees use to find, register for and attend them. Events are organised by the Spaces that publish them, not by Unifesto. The organiser is responsible for the event itself: its content, venue, safety, accuracy of information, and whether it takes place. Unifesto acts as an intermediary under the Information Technology Act, 2000 for content organisers and users publish.

## Your account {#accounts}

- You sign in with your mobile number (with a one-time code), email, Google or Apple. Keep access to these secure; you are responsible for activity on your account.
- Give accurate information, keep it current, and use one account per person.
- Tell us at [support@unifesto.app](mailto:support@unifesto.app) if you suspect unauthorised use.
- You can delete your account at any time (see [Delete your account](/delete-account)).

## Spaces and organisers {#organisers}

A Space is created on request and reviewed by Unifesto before it goes live. If you run a Space or an event, you agree to:

- name a Space after a college, company, club or other organisation only if you are authorised to represent it, and use its name, logo and other marks only with its permission;
- describe events, tickets, prices, dates and venues accurately, and honour the registrations you accept;
- hold any permissions, licences and approvals your event needs, and run it lawfully and safely;
- use attendee data only to run your event and communicate about it, keep it secure, and not sell it or use it for unrelated marketing without the attendee’s consent;
- review refund requests in good faith and cancel registrations properly if the event does not happen;
- give your team only the roles and access they need, and remain responsible for their actions in your Space;
- for stays, list properties accurately, keep guest photo IDs confidential, and take responsibility for the property, rooms and guest safety;
- for sponsors, collect leads only through the sponsor tools, where attendees choose to share their details.

A **verified** badge means Unifesto has checked that the Space is run by, or with the permission of, the organisation it names. Other Spaces are run by their members, and a Space naming an organisation does not mean that organisation runs, sponsors or endorses it. We may rename, hand over, hide or remove a Space that uses an organisation’s name or marks without permission. If you represent an organisation, see [Grievance: your organisation’s name or logo](/grievance#organisations).

## Registering and attending {#attendees}

- A ticket or pass is a licence to attend that event on the organiser’s terms. It is personal unless the organiser transfers it.
- Follow the organiser’s rules at the venue. Organisers may refuse entry for misconduct or an invalid pass.
- For group tickets, the person who buys the seats is responsible for the people they invite.
- Stay bookings need the event team’s approval and, for online stays, payment within the stated window.

## Payments, fees and payouts {#payments}

- Payments are processed by Razorpay in Indian rupees. Prices are set by organisers and shown before you pay.
- From 2 November 2026, Unifesto charges organisers a platform fee on paid tickets sold from that date, at the rate for their plan listed on our [pricing page](/pricing). Tickets sold before then are not affected. We give organisers at least 14 days’ notice before changing a plan’s rate, and a change applies only to tickets sold after it.
- Attendees pay a processing fee of 5% of the ticket price at checkout, capped at ₹99 per ticket, unless the organiser includes it in the ticket price. The processing fee is not refundable.
- Where GST or another tax applies to our fees, it is shown before you pay.
- Organisers receive payouts to a verified bank account on their Space, after deducting fees and refunds. We may hold or adjust a payout to cover refunds, chargebacks, or suspected fraud.
- Refunds follow our [Refund and Cancellation Policy](/refund).

## Your content {#content}

You own what you post (event pages, images, profile details, submissions). You give Unifesto a non-exclusive, royalty-free licence to host, display and distribute it within the Services and to promote the events you publish, for as long as it is on the Services.

The Unifesto name, logo, apps and software belong to Unifesto. You may not copy, modify or reverse engineer them except as the law allows.

## Acceptable use {#acceptable-use}

You must not use the Services to host, publish or share anything that:

- belongs to someone else and you have no right to;
- is obscene, pornographic, paedophilic, invasive of privacy, or harassing on grounds of gender, caste, religion or ethnicity;
- is harmful to children, or promotes violence, hatred or unlawful activity;
- infringes a patent, trademark, copyright or other proprietary right;
- deceives or misleads, including fake events, false prices or impersonation of a person or organisation;
- contains malware, or threatens the unity, integrity, security or sovereignty of India or public order;
- violates any law in force.

You also must not scrape or bulk-collect data, probe or attack our systems, bypass access controls, or resell the Services without our permission.

Report content that breaks these rules from the report option in the app or to [grievance@unifesto.app](mailto:grievance@unifesto.app). We act on reports as the IT (Intermediary Guidelines) Rules, 2021 require, and may remove content, suspend events or close accounts that break these Terms.

## Suspension and termination {#termination}

You may stop using the Services and delete your account at any time. We may suspend or end access for a breach of these Terms, fraud, a legal requirement, or risk to other users, with notice where the law requires and it is practical. Obligations that by their nature should survive (payments owed, records, liability limits, disputes) survive termination.

## Disclaimers and liability {#liability}

We work to keep the Services available and accurate, but they are provided “as is”. We do not guarantee that any event will take place as described; that is the organiser’s responsibility.

To the extent the law allows, Unifesto is not liable for indirect or consequential loss, or for events, venues, stays or conduct of organisers and attendees. Our total liability to you for any claim is limited to the fees you paid to Unifesto in the 12 months before the claim. Nothing in these Terms limits rights you have under the Consumer Protection Act, 2019 or other law that cannot be excluded.

You agree to indemnify Unifesto against claims arising from your breach of these Terms or the law, or, for organisers, from events you run.

## Governing law and disputes {#law}

These Terms are governed by the laws of India. Before going to court, contact our Grievance Officer so we can try to resolve the issue. Subject to that, the courts at Hyderabad, Telangana have exclusive jurisdiction.

## Grievance Officer {#grievance}

In line with the IT Rules, 2021 and the Consumer Protection (E-Commerce) Rules, 2020, our Grievance Officer is **Vinay Buddolla**, reachable at [grievance@unifesto.app](mailto:grievance@unifesto.app). Complaints are acknowledged within 24 hours and resolved within 15 days.

## Changes {#changes}

We may update these Terms as the Services change. The effective date at the top shows the latest version. For material changes we will notify you in the app or by email before they apply; continuing to use the Services after that means you accept them. Questions about these Terms: [legal@unifesto.app](mailto:legal@unifesto.app).
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('privacy', 1, 'Privacy Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Who we are {#who-we-are}

Unifesto is operated by Unifesto Private Limited (CIN U63112TS2025PTC208307), C/O Malla Reddy Education, Sy. No. 640/P and 641/P, Quthbullapur Mandal, Hyderabad, Telangana 500100, India (“Unifesto”, “we”, “us”). This policy covers the Unifesto website, the Unifesto app for iOS and Android, and the Unifesto Space console (together, the “Services”).

For personal data you give us to use the Services, Unifesto is the **Data Fiduciary** under India’s Digital Personal Data Protection Act, 2023 (“DPDP Act”). When you register for an event, the organiser of that event also receives your registration details and is responsible for how they use them (see section 5).

## What we collect {#what-we-collect}

### You give us

- **Account:** mobile number, email address (if you sign in with email, Google or Apple), name, username, gender, profile photo, bio and the social links you choose to add.
- **Event registrations:** the ticket you choose, the answers you give to an organiser’s questions (which can include files you upload), and the details of team members you register.
- **Stays:** for accommodation bookings, each guest’s name, phone, email, gender and a photo ID, plus arrival time and an emergency contact.
- **Payments:** payments are made through Razorpay. We receive the order and payment reference, amount and status. We never receive or store your card, UPI PIN or bank login details.
- **Organisers:** Space details, event content, team members, and the bank account you add for payouts.
- **Participation:** check-ins, hackathon teams and submissions, judging scores, help desk queries, live session participation, support requests, and messages you send to our WhatsApp business number.

### Collected automatically

- **Device and app:** app version, platform, a push notification subscription ID and the time you were last active.
- **Usage and crashes:** in the app, Google Firebase records which screens are used and crash reports, to fix problems and improve the app.
- **Page views:** when an event or Space page is opened, we record an anonymous visitor ID, the platform and any campaign (UTM) tags on the link, so organisers can see where visitors came from.
- **Location (optional):** if you allow it, the app reads an approximate location while you use it and converts it to your city on your device. Only the city name is sent to us, to show nearby events. We do not collect precise or background location.

The app asks for the camera (to scan QR passes and take photos), microphone (to speak in live sessions), photo library and notifications only when you use a feature that needs them. You can change these permissions in your device settings at any time.

## Why we use it {#why}

- To create and secure your account and sign you in, including one-time codes sent over WhatsApp.
- To register you for events, issue passes and tickets, check you in, and send confirmations, reminders and updates about events you joined.
- To process payments, refunds and payouts, and keep the records tax and accounting law requires.
- To run the features you use: stays, live sessions, hackathons, certificates and support.
- To show nearby and relevant events, and to keep the Services reliable, secure and free of fraud and abuse.
- To send product announcements and campaigns, which you can turn off in Notification settings.

We process your data on the basis of your consent, given when you sign up or use a feature, and for the legitimate uses the DPDP Act allows, such as performing a transaction you asked for or complying with the law. You can withdraw consent at any time (section 8); this does not affect processing already done.

## What other people can see {#public}

Your public profile (name, username, photo, bio, social links, the Spaces you follow and the public events you are going to or have been to) can be seen by other Unifesto users. Your mobile number, email address and registration answers are never shown on your profile. Certificates you earn have a verification link that anyone with the link can open.

## Who we share it with {#sharing}

- **Event organisers:** when you register for an event, its organisers (the Space team and any co-hosting Space) receive your name, contact details, ticket, registration answers and check-in status, to run that event. For stays, the event team receives guest details and photo IDs.
- **Sponsors:** only if you let a sponsor scan your pass at their booth or send them an enquiry yourself.
- **Hackathon judges and volunteers:** your team, submission and help desk queries, for that hackathon.
- **Service providers** who process data for us under contract, listed below.
- **Authorities,** when the law requires it or to protect the rights and safety of users and the public.
- **A successor,** if Unifesto is merged or acquired, under the same protections.

We do not sell your personal data, and we do not share it with advertisers.

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

## Where it is stored and how it is protected {#storage}

Our servers and database run on Amazon Web Services in India (Mumbai). Some providers above process data outside India; such transfers are made as permitted under the DPDP Act and under contracts that require them to protect it.

- All traffic to the Services is encrypted in transit (HTTPS/TLS).
- Uploaded files such as photo IDs and registration documents are kept in private storage and are available only to the people who need them for that event.
- Access inside organiser teams is limited by role, and Unifesto staff access is restricted and logged.
- Payments are handled by Razorpay, a PCI-DSS compliant payment processor.

If a personal data breach occurs, we will inform the Data Protection Board of India and affected users as the DPDP Act and Rules require.

## How long we keep it {#retention}

- **Your account:** until you delete it. Deletion closes the account after a 30-day grace period and removes your personal details (see [Delete your account](/delete-account)).
- **Payment, refund, payout and tax records:** for as long as tax and accounting laws require, which can be up to eight years, with your name and contact details removed once your account is closed.
- **Event records** such as registrations, check-ins and stay bookings: kept as part of that event’s records. When your account is closed they are no longer linked to your name or contact details, but answers you gave to an organiser’s questions stay with that event. To have those erased too, write to [privacy@unifesto.app](mailto:privacy@unifesto.app).
- **Server and security logs:** kept for a limited period to keep the Services secure and investigate problems.

## Your rights {#rights}

Under the DPDP Act you have the right to:

- get a summary of the personal data we hold about you and how it is processed;
- correct, complete or update it (most of it you can edit yourself in the app);
- have it erased, by deleting your account or writing to us;
- withdraw consent and turn off optional processing such as campaigns and location;
- nominate another person to exercise these rights if you die or become incapacitated;
- have your grievances addressed (section 10).

Use the [Privacy Request Center](/privacy-requests) or write to [privacy@unifesto.app](mailto:privacy@unifesto.app) from the email or phone number on your account. We may verify your identity before acting; the [Data Principal Rights Policy](/data-rights) explains how we handle each request.

## Children {#children}

The Services are meant for people aged 18 and over. Anyone under 18 may use them only with the verifiable consent of a parent or lawful guardian. We do not knowingly track, profile or target advertising at children. If you believe a child has given us personal data without that consent, write to [privacy@unifesto.app](mailto:privacy@unifesto.app) and we will delete it.

## Grievance Officer {#grievance}

If you have a complaint about how your personal data is handled, contact our Grievance Officer, **Vinay Buddolla**, at [grievance@unifesto.app](mailto:grievance@unifesto.app). We acknowledge complaints within 24 hours and aim to resolve them within 15 days.

If you are not satisfied with our response, you may approach the Data Protection Board of India once it accepts complaints under the DPDP Act.

## Changes to this policy {#changes}

We will update this policy when our practices change and show the new effective date at the top. For material changes we will tell you in the app or by email before they take effect.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('refund', 1, 'Refund and Cancellation Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## How refunds work {#overview}

Tickets are sold by the organisers who run each event. Every refund request is reviewed in two stages: first by the event’s organiser, who checks it against their event, then by Unifesto, which makes the final decision and issues the refund. This protects attendees and organisers from mistaken or fraudulent refunds.

## Requesting a refund {#request}

1. Open the Unifesto app and go to **Tickets**.
2. Open the ticket and tap **Refund**, then **Request a refund**.
3. Choose or write a reason and submit.

You can follow the request in the same screen as it moves through organiser review, in review and the final decision. Organisers can also start a refund for you. Without the app, write to [refunds@unifesto.app](mailto:refunds@unifesto.app) from the email or phone number on your account.

## What is refunded {#amount}

- An approved refund returns the **ticket’s base price**, or the part of it that was approved.
- The processing fee shown at checkout (“app fee”) is **not refundable**.
- If you used a coupon, the refund is based on the amount you actually paid.
- Free tickets have nothing to refund; cancel them so the seat goes to someone else.

## Timelines {#timing}

Approved refunds are sent back to the original payment method through Razorpay. Banks and card networks usually credit them within 5 to 7 working days of approval, sometimes longer. You are notified when the refund is approved or declined, with the reason if declined.

## If an event is cancelled or changed {#cancelled}

- **Cancelled by the organiser:** you are entitled to a refund of the ticket’s base price.
- **Postponed or materially changed:** your ticket stays valid for the new date. If you cannot attend, you may request a refund, which the organiser and Unifesto review as above.

## When a refund may be declined {#not-eligible}

- The event took place and you did not attend, or you were refused entry for breaking the venue’s rules.
- The organiser stated before you bought that the ticket is non-refundable, and the event happened as described.
- The ticket was already checked in or already refunded.

## Stays {#stays}

- Free stays and stays paid at the property involve no payment through Unifesto.
- Online stays are paid only after the event team approves your request. A paid online stay can be cancelled by the event team, who can refund its base amount (the processing fee is not refundable) straight to your original payment method. Ask the event team, or write to us, to cancel.
- If a payment arrives after a booking has expired or been cancelled, it is refunded in full automatically.
- If you do not pay within the payment window, the booking expires and the beds are released; nothing is charged.

## Questions and complaints {#contact}

For refund questions write to [refunds@unifesto.app](mailto:refunds@unifesto.app). If you are unhappy with a decision, contact our Grievance Officer, **Vinay Buddolla**, at [grievance@unifesto.app](mailto:grievance@unifesto.app). Complaints are acknowledged within 24 hours and resolved within 15 days.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('cookies', 1, 'Cookie Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## In short {#summary}

- The public website (unifesto.app) sets **no cookies**.
- We use **no advertising, tracking or third-party analytics cookies** on any of our websites.
- The organiser console sets one cookie that is strictly necessary to keep you signed in.

## What we store in your browser {#what}

Cookies and browser storage are small pieces of data a website keeps on your device. This is the complete list of what Unifesto keeps:

| Name | Where | Purpose | How long |
| --- | --- | --- | --- |
| theme | unifesto.app (local storage) | Remembers light, dark or system theme if you change it | Until you clear it or pick System |
| unifesto.utm | unifesto.app (session storage) | Keeps the campaign tags of the link you arrived on, so they carry into the app | Until you close the tab |
| unifesto_token | space.unifesto.app, apex.unifesto.app (cookie and local storage) | Keeps you signed in to the organiser console across its subdomains | 30 days, or until you sign out |

All three are first-party and strictly necessary or set only when you choose a preference, so they do not need a consent banner. None of them is used to track you across other websites.

## Third parties {#third-party}

Pages that take payments open Razorpay’s checkout, and signing in with Google or Apple opens their sign-in page. Those services may set their own cookies under their own policies while you use them. The Unifesto app for iOS and Android does not use browser cookies; how it handles data is described in the [Privacy Policy](/privacy).

## Your choices {#control}

You can clear or block cookies and site storage in your browser settings. If you block the console’s sign-in cookie you will not be able to stay signed in to the organiser console; everything on the public website keeps working.

## Changes {#changes}

If we ever add a cookie that is not strictly necessary, we will update this page and ask for your consent first. Questions: [privacy@unifesto.app](mailto:privacy@unifesto.app).
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('grievance', 1, 'Grievance Redressal Policy', NULL, false, TIMESTAMPTZ '2026-10-06 00:00:00+05:30', now(), btrim($md$
## Grievance Officer {#officer}

**Vinay Buddolla**, Grievance Officer  
Unifesto Private Limited, C/O Malla Reddy Education, Sy. No. 640/P and 641/P, Quthbullapur Mandal, Hyderabad, Telangana 500100, India  
Email: [grievance@unifesto.app](mailto:grievance@unifesto.app)

Most questions are answered faster by [support@unifesto.app](mailto:support@unifesto.app). Come to the Grievance Officer when support has not resolved your issue, or for anything listed below.

## What you can raise {#scope}

- Content on Unifesto that breaks our [Terms](/terms#acceptable-use) or the [Code of Conduct](/code-of-conduct), or the law.
- A purchase, refund or cancellation that was not handled properly (see the [Refund Policy](/refund)).
- How your personal data is handled, or a privacy request we did not resolve.
- A decision to remove your content, suspend an event or close your account.
- Problems with an organiser’s conduct that the organiser has not addressed.
- A Space or event using your organisation’s name, logo or other marks without permission (see below).

## Your organisation’s name or logo {#organisations}

Spaces are created by their members. Unless a Space shows a verified badge, Unifesto has not confirmed that it is run by, or affiliated with, any college, company or community it names. If you represent an organisation and a Space or event uses its name, logo or other marks without permission, email [grievance@unifesto.app](mailto:grievance@unifesto.app) with:

- the link to the Space or event;
- who you are and your role, from an email address on the organisation’s own domain where you have one;
- the name, logo or mark concerned, and any trademark registration number;
- what you would like: the Space removed, renamed, its logo taken down, or handed over to you.

We tell the Space’s team and act within the timelines below. If you would like to run an official Space for your organisation, ask us to verify it or hand an existing one over to you.

## How to raise a grievance {#how}

Raise it here and it reaches the Grievance Officer as a case with a number you can follow in the app under My help. Use the email on your Unifesto account; we send it a code to confirm it is yours.

<!-- slot:grievance-form -->

Or email [grievance@unifesto.app](mailto:grievance@unifesto.app) with:

- your name and the email or phone on your Unifesto account;
- what happened, with links to the event, Space, profile or content involved;
- any order or payment reference, and screenshots if helpful;
- what you would like us to do.

You can also report an event or Space from the app with **Report** in its menu.

## Timelines {#timelines}

- **Acknowledgement:** within 24 hours, with a ticket number.
- **Resolution:** within 15 days.
- **Requests to remove unlawful content:** acted on within 72 hours.
- **A Space or event using an organisation’s name or marks without permission:** acted on within 72 hours of a complete complaint.
- **Content showing a person in a sexual act, nudity or impersonation of them in such content:** removed or disabled within 24 hours of the complaint.

## If you are not satisfied {#escalation}

- **Content decisions:** appeal to the Grievance Appellate Committee at [gac.gov.in](https://gac.gov.in) within 30 days of our decision.
- **Personal data:** complain to the Data Protection Board of India.
- **Purchases and refunds:** the National Consumer Helpline (1915, [consumerhelpline.gov.in](https://consumerhelpline.gov.in)) or the consumer commission with jurisdiction.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('terms', 2, 'Terms of Service', 'We moved the rules for running a Space into a separate Organiser Agreement, and added an Acceptable Use Policy and Sponsor and Partner Terms. What attendees agree to has not changed.', true, NULL, now(), btrim($md$
## Agreement {#agreement}

These Terms are a contract between you and Unifesto Private Limited (“Unifesto”, “we”) for using the Unifesto website, app and Space console (the “Services”). By creating an account or using the Services you agree to these Terms, our [Privacy Policy](/privacy), our [Refund and Cancellation Policy](/refund), our [Acceptable Use Policy](/acceptable-use) and [Code of Conduct](/code-of-conduct). If you run a Space, the [Organiser Agreement](/organiser-agreement) also applies; if you are a sponsor or partner, the [Sponsor and Partner Terms](/sponsor-terms) also apply. If you do not agree, do not use the Services.

You must be 18 or older, or use the Services with the consent of a parent or lawful guardian who accepts these Terms on your behalf. If you use the Services for a club, institution or company, you confirm you are allowed to bind it to these Terms.

## What Unifesto is, and is not {#role}

Unifesto provides the tools organisers use to publish and run events, and attendees use to find, register for and attend them. Events are organised by the Spaces that publish them, not by Unifesto. The organiser is responsible for the event itself: its content, venue, safety, accuracy of information, and whether it takes place. Unifesto acts as an intermediary under the Information Technology Act, 2000 for content organisers and users publish.

## Your account {#accounts}

- You sign in with your mobile number (with a one-time code), email, Google or Apple. Keep access to these secure; you are responsible for activity on your account.
- Give accurate information, keep it current, and use one account per person.
- Tell us at [support@unifesto.app](mailto:support@unifesto.app) if you suspect unauthorised use.
- You can delete your account at any time (see [Delete your account](/delete-account)).

## Spaces and organisers {#organisers}

A Space is created on request and reviewed by Unifesto before it goes live. If you run a Space or an event, or are on a Space’s team, you also agree to the [Organiser Agreement](/organiser-agreement), which sets out what organisers must do, how fees and payouts work, and how organisers may use attendee data. If it conflicts with these Terms on running a Space or an event, the Organiser Agreement applies.

A **verified** badge means Unifesto has checked that the Space is run by, or with the permission of, the organisation it names. Other Spaces are run by their members, and a Space naming an organisation does not mean that organisation runs, sponsors or endorses it. We may rename, hand over, hide or remove a Space that uses an organisation’s name or marks without permission. If you represent an organisation, see [Grievance: your organisation’s name or logo](/grievance#organisations).

## Registering and attending {#attendees}

- A ticket or pass is a licence to attend that event on the organiser’s terms. It is personal unless the organiser transfers it.
- Follow the organiser’s rules at the venue. Organisers may refuse entry for misconduct or an invalid pass.
- For group tickets, the person who buys the seats is responsible for the people they invite.
- Stay bookings need the event team’s approval and, for online stays, payment within the stated window.

## Payments, fees and payouts {#payments}

- Payments are processed by Razorpay in Indian rupees. Prices are set by organisers and shown before you pay.
- From 2 November 2026, Unifesto charges organisers a platform fee on paid tickets sold from that date, at the rate for their plan listed on our [pricing page](/pricing). Tickets sold before then are not affected. We give organisers at least 14 days’ notice before changing a plan’s rate, and a change applies only to tickets sold after it.
- Attendees pay a processing fee of 5% of the ticket price at checkout, capped at ₹99 per ticket, unless the organiser includes it in the ticket price. The processing fee is not refundable.
- Where GST or another tax applies to our fees, it is shown before you pay.
- Organisers receive payouts to a verified bank account on their Space, after deducting fees and refunds. We may hold or adjust a payout to cover refunds, chargebacks, or suspected fraud.
- Refunds follow our [Refund and Cancellation Policy](/refund).

## Your content {#content}

You own what you post (event pages, images, profile details, submissions). You give Unifesto a non-exclusive, royalty-free licence to host, display and distribute it within the Services and to promote the events you publish, for as long as it is on the Services.

The Unifesto name, logo, apps and software belong to Unifesto. You may not copy, modify or reverse engineer them except as the law allows.

## Acceptable use {#acceptable-use}

You must not use the Services to host, publish or share anything that:

- belongs to someone else and you have no right to;
- is obscene, pornographic, paedophilic, invasive of privacy, or harassing on grounds of gender, caste, religion or ethnicity;
- is harmful to children, or promotes violence, hatred or unlawful activity;
- infringes a patent, trademark, copyright or other proprietary right;
- deceives or misleads, including fake events, false prices or impersonation of a person or organisation;
- contains malware, or threatens the unity, integrity, security or sovereignty of India or public order;
- violates any law in force.

You also must not scrape or bulk-collect data, probe or attack our systems, bypass access controls, or resell the Services without our permission. The [Acceptable Use Policy](/acceptable-use) has the full rules.

Report content that breaks these rules from the report option in the app or to [grievance@unifesto.app](mailto:grievance@unifesto.app). We act on reports as the IT (Intermediary Guidelines) Rules, 2021 require, and may remove content, suspend events or close accounts that break these Terms.

## Suspension and termination {#termination}

You may stop using the Services and delete your account at any time. We may suspend or end access for a breach of these Terms, fraud, a legal requirement, or risk to other users, with notice where the law requires and it is practical. Obligations that by their nature should survive (payments owed, records, liability limits, disputes) survive termination.

## Disclaimers and liability {#liability}

We work to keep the Services available and accurate, but they are provided “as is”. We do not guarantee that any event will take place as described; that is the organiser’s responsibility.

To the extent the law allows, Unifesto is not liable for indirect or consequential loss, or for events, venues, stays or conduct of organisers and attendees. Our total liability to you for any claim is limited to the fees you paid to Unifesto in the 12 months before the claim. Nothing in these Terms limits rights you have under the Consumer Protection Act, 2019 or other law that cannot be excluded.

You agree to indemnify Unifesto against claims arising from your breach of these Terms or the law, or, for organisers, from events you run.

## Governing law and disputes {#law}

These Terms are governed by the laws of India. Before going to court, contact our Grievance Officer so we can try to resolve the issue. Subject to that, the courts at Hyderabad, Telangana have exclusive jurisdiction.

## Grievance Officer {#grievance}

In line with the IT Rules, 2021 and the Consumer Protection (E-Commerce) Rules, 2020, our Grievance Officer is **Vinay Buddolla**, reachable at [grievance@unifesto.app](mailto:grievance@unifesto.app). Complaints are acknowledged within 24 hours and resolved within 15 days.

## Changes {#changes}

We may update these Terms as the Services change. The effective date at the top shows the latest version. For material changes we will notify you in the app or by email before they apply; continuing to use the Services after that means you accept them. Questions about these Terms: [legal@unifesto.app](mailto:legal@unifesto.app).
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('privacy', 2, 'Privacy Policy', 'We now say how long we keep each kind of data, including that answers you give to an organiser’s questions are erased when you close your account.', true, NULL, now(), btrim($md$
## Who we are {#who-we-are}

Unifesto is operated by Unifesto Private Limited (CIN U63112TS2025PTC208307), C/O Malla Reddy Education, Sy. No. 640/P and 641/P, Quthbullapur Mandal, Hyderabad, Telangana 500100, India (“Unifesto”, “we”, “us”). This policy covers the Unifesto website, the Unifesto app for iOS and Android, and the Unifesto Space console (together, the “Services”).

For personal data you give us to use the Services, Unifesto is the **Data Fiduciary** under India’s Digital Personal Data Protection Act, 2023 (“DPDP Act”). When you register for an event, the organiser of that event also receives your registration details and is responsible for how they use them (see section 5).

## What we collect {#what-we-collect}

### You give us

- **Account:** mobile number, email address (if you sign in with email, Google or Apple), name, username, gender, profile photo, bio and the social links you choose to add.
- **Event registrations:** the ticket you choose, the answers you give to an organiser’s questions (which can include files you upload), and the details of team members you register.
- **Stays:** for accommodation bookings, each guest’s name, phone, email, gender and a photo ID, plus arrival time and an emergency contact.
- **Payments:** payments are made through Razorpay. We receive the order and payment reference, amount and status. We never receive or store your card, UPI PIN or bank login details.
- **Organisers:** Space details, event content, team members, and the bank account you add for payouts.
- **Participation:** check-ins, hackathon teams and submissions, judging scores, help desk queries, live session participation, support requests, and messages you send to our WhatsApp business number.

### Collected automatically

- **Device and app:** app version, platform, a push notification subscription ID and the time you were last active.
- **Usage and crashes:** in the app, Google Firebase records which screens are used and crash reports, to fix problems and improve the app.
- **Page views:** when an event or Space page is opened, we record an anonymous visitor ID, the platform and any campaign (UTM) tags on the link, so organisers can see where visitors came from.
- **Location (optional):** if you allow it, the app reads an approximate location while you use it and converts it to your city on your device. Only the city name is sent to us, to show nearby events. We do not collect precise or background location.

The app asks for the camera (to scan QR passes and take photos), microphone (to speak in live sessions), photo library and notifications only when you use a feature that needs them. You can change these permissions in your device settings at any time.

## Why we use it {#why}

- To create and secure your account and sign you in, including one-time codes sent over WhatsApp.
- To register you for events, issue passes and tickets, check you in, and send confirmations, reminders and updates about events you joined.
- To process payments, refunds and payouts, and keep the records tax and accounting law requires.
- To run the features you use: stays, live sessions, hackathons, certificates and support.
- To show nearby and relevant events, and to keep the Services reliable, secure and free of fraud and abuse.
- To send product announcements and campaigns, which you can turn off in Notification settings.

We process your data on the basis of your consent, given when you sign up or use a feature, and for the legitimate uses the DPDP Act allows, such as performing a transaction you asked for or complying with the law. You can withdraw consent at any time (section 8); this does not affect processing already done.

## What other people can see {#public}

Your public profile (name, username, photo, bio, social links, the Spaces you follow and the public events you are going to or have been to) can be seen by other Unifesto users. Your mobile number, email address and registration answers are never shown on your profile. Certificates you earn have a verification link that anyone with the link can open.

## Who we share it with {#sharing}

- **Event organisers:** when you register for an event, its organisers (the Space team and any co-hosting Space) receive your name, contact details, ticket, registration answers and check-in status, to run that event. For stays, the event team receives guest details and photo IDs.
- **Sponsors:** only if you let a sponsor scan your pass at their booth or send them an enquiry yourself.
- **Hackathon judges and volunteers:** your team, submission and help desk queries, for that hackathon.
- **Service providers** who process data for us under contract, listed below.
- **Authorities,** when the law requires it or to protect the rights and safety of users and the public.
- **A successor,** if Unifesto is merged or acquired, under the same protections.

We do not sell your personal data, and we do not share it with advertisers.

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

## Where it is stored and how it is protected {#storage}

Our servers and database run on Amazon Web Services in India (Mumbai). Some providers above process data outside India; such transfers are made as permitted under the DPDP Act and under contracts that require them to protect it.

- All traffic to the Services is encrypted in transit (HTTPS/TLS).
- Uploaded files such as photo IDs and registration documents are kept in private storage and are available only to the people who need them for that event.
- Access inside organiser teams is limited by role, and Unifesto staff access is restricted and logged.
- Payments are handled by Razorpay, a PCI-DSS compliant payment processor.

If a personal data breach occurs, we will inform the Data Protection Board of India and affected users as the DPDP Act and Rules require.

## How long we keep it {#retention}

- **Your account:** until you delete it. Deletion closes the account after a 30-day grace period and removes your personal details (see [Delete your account](/delete-account)).
- **Answers to an organiser’s questions:** the answers you give when you register for an event or book a stay, including any emergency contact, are erased when your account is closed, and in any case 2 years after the event ends.
- **Uploaded files:** files you upload with those answers, such as photo IDs and documents, are deleted 180 days after the event ends, or when your account is closed if that comes first.
- **Team members, guests and ticket holders:** the names and contact details entered for group members, stay guests and named tickets are erased 2 years after the event ends.
- **Sponsor and organiser leads:** 2 years after the lead was collected.
- **Support conversations:** 3 years after the last message, once the conversation is resolved or closed.
- **Messages to our WhatsApp business number:** 1 year after the last message.
- **Job applications:** 1 year after you apply, with your résumé.
- **Payment, refund, payout and tax records:** for as long as tax and accounting laws require, which can be up to eight years, with your name and contact details removed once your account is closed. Amounts and payment references are kept so the accounts still reconcile.
- **Event records** such as registrations, check-ins and stay bookings: kept as part of that event’s records, without the details above once they are erased. When your account is closed they are no longer linked to your name or contact details.
- **Records of your consent:** which version of our Terms, this policy and other documents you accepted, and when, for as long as we need to show that consent was given.
- **Server and request logs:** 180 days, to keep the Services secure and investigate problems. Anonymous page view records: 400 days.

## Your rights {#rights}

Under the DPDP Act you have the right to:

- get a summary of the personal data we hold about you and how it is processed;
- correct, complete or update it (most of it you can edit yourself in the app);
- have it erased, by deleting your account or writing to us;
- withdraw consent and turn off optional processing such as campaigns and location;
- nominate another person to exercise these rights if you die or become incapacitated;
- have your grievances addressed (section 10).

Use the [Privacy Request Center](/privacy-requests) or write to [privacy@unifesto.app](mailto:privacy@unifesto.app) from the email or phone number on your account. We may verify your identity before acting; the [Data Principal Rights Policy](/data-rights) explains how we handle each request.

## Children {#children}

The Services are meant for people aged 18 and over. Anyone under 18 may use them only with the verifiable consent of a parent or lawful guardian. We do not knowingly track, profile or target advertising at children. If you believe a child has given us personal data without that consent, write to [privacy@unifesto.app](mailto:privacy@unifesto.app) and we will delete it.

## Grievance Officer {#grievance}

If you have a complaint about how your personal data is handled, contact our Grievance Officer, **Vinay Buddolla**, at [grievance@unifesto.app](mailto:grievance@unifesto.app). We acknowledge complaints within 24 hours and aim to resolve them within 15 days.

If you are not satisfied with our response, you may approach the Data Protection Board of India once it accepts complaints under the DPDP Act.

## Changes to this policy {#changes}

We will update this policy when our practices change and show the new effective date at the top. For material changes we will tell you in the app or by email before they take effect.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('refund', 2, 'Refund and Cancellation Policy', 'We now state the processing fee (5% of the ticket price, capped at ₹99 per ticket) and what is refunded when an organiser includes the fee in the ticket price.', false, NULL, now(), btrim($md$
## How refunds work {#overview}

Tickets are sold by the organisers who run each event. Every refund request is reviewed in two stages: first by the event’s organiser, who checks it against their event, then by Unifesto, which makes the final decision and issues the refund. This protects attendees and organisers from mistaken or fraudulent refunds.

## Requesting a refund {#request}

1. Open the Unifesto app and go to **Tickets**.
2. Open the ticket and tap **Refund**, then **Request a refund**.
3. Choose or write a reason and submit.

You can follow the request in the same screen as it moves through organiser review, in review and the final decision. Organisers can also start a refund for you. Without the app, write to [refunds@unifesto.app](mailto:refunds@unifesto.app) from the email or phone number on your account.

## What is refunded {#amount}

- An approved refund returns the **ticket’s base price**, or the part of it that was approved.
- The processing fee shown at checkout (“app fee”) is 5% of the ticket price, capped at ₹99 per ticket. It is **not refundable**.
- If the organiser includes the processing fee in the ticket price, the ticket’s base price is the price you paid less the processing fee included in it, and that is what is refunded.
- If you used a coupon, the refund is based on the amount you actually paid.
- Free tickets have nothing to refund; cancel them so the seat goes to someone else.

## Timelines {#timing}

Approved refunds are sent back to the original payment method through Razorpay. Banks and card networks usually credit them within 5 to 7 working days of approval, sometimes longer. You are notified when the refund is approved or declined, with the reason if declined.

## If an event is cancelled or changed {#cancelled}

- **Cancelled by the organiser:** you are entitled to a refund of the ticket’s base price.
- **Postponed or materially changed:** your ticket stays valid for the new date. If you cannot attend, you may request a refund, which the organiser and Unifesto review as above.

## When a refund may be declined {#not-eligible}

- The event took place and you did not attend, or you were refused entry for breaking the venue’s rules.
- The organiser stated before you bought that the ticket is non-refundable, and the event happened as described.
- The ticket was already checked in or already refunded.

## Stays {#stays}

- Free stays and stays paid at the property involve no payment through Unifesto.
- Online stays are paid only after the event team approves your request. A paid online stay can be cancelled by the event team, who can refund its base amount (the processing fee is not refundable) straight to your original payment method. Ask the event team, or write to us, to cancel.
- If a payment arrives after a booking has expired or been cancelled, it is refunded in full automatically.
- If you do not pay within the payment window, the booking expires and the beds are released; nothing is charged.

## Questions and complaints {#contact}

For refund questions write to [refunds@unifesto.app](mailto:refunds@unifesto.app). If you are unhappy with a decision, contact our Grievance Officer, **Vinay Buddolla**, at [grievance@unifesto.app](mailto:grievance@unifesto.app). Complaints are acknowledged within 24 hours and resolved within 15 days.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('organiser-agreement', 1, 'Organiser Agreement', 'The terms for running a Space on Unifesto: what organisers are responsible for, fees, payouts, refunds and how attendee data may be used.', true, NULL, now(), btrim($md$
<!-- DRAFT (I1): needs review by a lawyer before it is published. Replace every [TBC: ...] first. -->

## About this agreement {#agreement}

This Organiser Agreement is between Unifesto Private Limited (“Unifesto”, “we”) and anyone who runs a Space on Unifesto or works on a Space’s team as an admin, curator, co-curator or crew member (“you”). It adds to our [Terms of Service](/terms), [Acceptable Use Policy](/acceptable-use) and [Privacy Policy](/privacy). Where it conflicts with the Terms on running a Space or an event, this agreement applies.

If you accept it for a college, club, company or other organisation, you confirm you are allowed to bind that organisation, and “you” includes it.

## Your Space {#space}

- A Space is created on request and reviewed by Unifesto before it goes live. We may decline a request without giving a reason.
- Name a Space after a college, company, club or other organisation only if you are authorised to represent it, and use its name, logo and other marks only with its permission.
- A **verified** badge means Unifesto has checked that the Space is run by, or with the permission of, the organisation it names. We may rename, hand over, hide or remove a Space that uses an organisation’s name or marks without permission.
- The person who created the Space is responsible for it and for its plan, until ownership is handed over through the Space console.
- Give your team only the roles and access they need. You are responsible for what your team does in your Space.

## Running events {#events}

- Describe events, tickets, prices, dates, venues and any refund conditions accurately, and honour the registrations you accept.
- Hold the permissions, licences and approvals your event needs (venue, police, fire, music, food and any others), and run it lawfully and safely.
- You, not Unifesto, are the organiser of your events and responsible for their content, venue, safety and whether they take place.
- If an event is cancelled, cancel it in the Space console so attendees are told and refunds can be processed.
- For stays, list properties accurately, keep guest photo IDs confidential, and take responsibility for the property, rooms and guest safety.
- For hackathons, publish the rules, judging criteria and prizes before registration opens, and award prizes as published.

## Fees {#fees}

- **Platform fee:** from 2 November 2026, Unifesto charges a platform fee on paid tickets sold from that date, at the rate for your Space’s plan shown on our [pricing page](/pricing) and in the Space console. We give at least 14 days’ notice before changing a plan’s rate, and a change applies only to tickets sold after it.
- **Processing fee:** attendees pay a processing fee of 5% of the ticket price at checkout, capped at ₹99 per ticket. You can choose to include it in your ticket price instead; the attendee then pays the listed price and the fee comes out of it.
- **Plans:** paid plans are billed to the Space as shown when you subscribe. [TBC: plan billing period, renewal and cancellation terms.]
- **Taxes:** [TBC: GST. Unifesto is not registered for GST at the time of drafting. Confirm the GST position on platform and plan fees before publishing.] You are responsible for any tax due on your own ticket sales.

## Payouts {#payouts}

- Ticket money is collected by Unifesto through Razorpay. You receive payouts to a bank account on your Space after Unifesto has verified it.
- A payout is the money collected for your events, less processing fees, platform fees and refunds. You can see what is available in the Space console and request a payout there. [TBC: payout timing after an event ends.]
- We may hold, reduce or recover a payout to cover refunds, chargebacks, suspected fraud, or amounts you owe us, and tell you why.

## Refunds {#refunds}

- Refunds follow our [Refund and Cancellation Policy](/refund). You review each refund request for your events in good faith, and Unifesto makes the final decision.
- Approved refunds return the ticket’s base price. The processing fee is not refunded.
- If you cancel an event, attendees are entitled to a refund of the ticket’s base price, which comes out of your payouts.

## Attendee data {#data}

- When someone registers for your event, you receive their name, contact details, ticket, answers to your questions and check-in status. Use them only to run that event and communicate about it.
- Do not sell attendee data, share it with anyone outside your team, or use it for unrelated marketing unless the attendee has agreed to that.
- Ask only for the information your event needs. Photo IDs and documents you collect are deleted 180 days after the event ends.
- Send campaigns only through Unifesto’s tools, which honour attendees’ opt-outs.
- Keep exported data secure and delete it when you no longer need it for the event.
- [TBC: whether the organiser is a separate Data Fiduciary for attendee data, or acts for Unifesto, under the DPDP Act 2023; and the matching clauses.]

## Sponsors {#sponsors}

Collect sponsor leads only through Unifesto’s sponsor tools, where attendees choose to share their details by letting a sponsor scan their pass or by sending an enquiry. Make sure the sponsors you add agree to the [Sponsor and Partner Terms](/sponsor-terms).

## Suspension and termination {#termination}

We may suspend events, payouts or your Space if you break this agreement, the Terms or the law, if we suspect fraud, or if attendees are at risk. Where it is practical we tell you first. You can stop using Unifesto at any time; obligations for events already sold, refunds, payouts and data you received continue after that.

## Liability {#liability}

You indemnify Unifesto against claims arising from your events, your use of attendee data, and your breach of this agreement or the law. The limits on Unifesto’s liability in the [Terms](/terms#liability) apply. [TBC: any cap on organiser liability.]

## Changes {#changes}

We may update this agreement. For material changes we tell you in the Space console or by email and ask you to accept the new version before you continue. Questions: [legal@unifesto.app](mailto:legal@unifesto.app).
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('acceptable-use', 1, 'Acceptable Use Policy', NULL, false, NULL, now(), btrim($md$
<!-- DRAFT (I1): needs review by a lawyer before it is published. -->

## Who this applies to {#scope}

This policy applies to everyone who uses Unifesto: attendees, organisers and their teams, judges, mentors, volunteers and sponsors. It is part of our [Terms of Service](/terms). How people should behave at events is covered by the [Code of Conduct](/code-of-conduct).

## Content you must not post {#content}

You must not use Unifesto to host, publish or share anything that:

- belongs to someone else and you have no right to;
- is obscene, pornographic, paedophilic, invasive of another person’s privacy, or harassing on grounds of gender, caste, religion or ethnicity;
- is harmful to children;
- promotes violence, hatred, money laundering, gambling or any other unlawful activity;
- infringes a patent, trademark, copyright or other proprietary right;
- deceives or misleads, including fake events, false prices, or information you know to be false;
- impersonates another person or organisation, including naming a Space after an organisation you are not allowed to represent;
- contains software viruses or other code meant to harm a computer or system;
- threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with other countries, or public order;
- violates any law in force.

## Using the platform {#platform}

You must not:

- scrape, crawl or bulk-collect data from Unifesto, or collect other users’ details for purposes they did not agree to;
- probe, scan or attack our systems, or bypass sign-in, roles or other access controls (report security issues to [security@unifesto.app](mailto:security@unifesto.app) instead);
- create accounts in bulk or by automated means, or use someone else’s account;
- resell tickets above their listed price, or sell access to the Services, without our permission;
- send spam, or message attendees outside the purposes of the event they registered for;
- use payment features for anything other than real tickets, stays and plans, or to move money for someone else.

## Reporting {#reporting}

Report an event, Space or profile with **Report** in its menu in the app, or write to [grievance@unifesto.app](mailto:grievance@unifesto.app). See the [Grievance Redressal Policy](/grievance) for timelines.

## What we do {#enforcement}

We act on reports as the IT (Intermediary Guidelines) Rules, 2021 require. Depending on what happened, we may remove content, unpublish or suspend an event, hold payouts, remove someone from a Space’s team, or suspend or close an account. Where the law requires, we keep records and inform the authorities. You can raise a decision with the Grievance Officer and, for content decisions, appeal to the Grievance Appellate Committee.

## Changes {#changes}

We may update this policy. The effective date at the top shows the latest version.
$md$, E'\n'));

INSERT INTO "legal_documents" ("slug", "version", "title", "summary", "requires_acceptance", "published_at", "updated_at", "body")
VALUES ('sponsor-terms', 1, 'Sponsor and Partner Terms', NULL, false, NULL, now(), btrim($md$
<!-- DRAFT (I1): needs review by a lawyer before it is published. Replace every [TBC: ...] first. -->

## About these terms {#agreement}

These terms are between Unifesto Private Limited (“Unifesto”, “we”) and any sponsor or partner added to a Space or event on Unifesto, and the people who use the sponsor portal for it (“you”). They add to our [Terms of Service](/terms) and [Acceptable Use Policy](/acceptable-use).

## Your arrangement with the organiser {#arrangement}

Sponsorship fees, deliverables, branding and booth space are agreed between you and the organiser. Unifesto is not a party to that arrangement and does not collect sponsorship payments. [TBC: confirm this stays true if sponsorship payments are ever taken on Unifesto.]

## Your name and logo {#branding}

You allow the organiser and Unifesto to show your name, logo and links on the event and Space pages you are added to, for as long as you are listed. Tell the organiser, or write to us, to be removed.

## Leads {#leads}

- You receive an attendee’s details only when they choose to share them: by letting your team scan their pass at your booth, or by sending you an enquiry.
- Use those details only to follow up on that event and what you showed there. Do not sell them, share them with anyone else, or add them to unrelated marketing without the attendee’s separate consent.
- Honour any request from an attendee to stop contacting them or to delete their details.
- Keep leads you export secure and delete them when you no longer need them. [TBC: retention limit for exported leads.]
- When an attendee closes their Unifesto account, their details are removed from the leads we hold; leads you have already exported are your responsibility.

## Sponsor portal access {#portal}

Give portal access only to people who work for you and need it, and remove them when they leave. You are responsible for what they do in the portal.

## Conduct {#conduct}

Your team must follow the [Code of Conduct](/code-of-conduct) at events and the organiser’s rules at the venue.

## Ending {#ending}

The organiser can remove you from their Space or event, and we can suspend portal access if these terms are broken. Your duties for leads you received continue after that.

## Liability {#liability}

You indemnify Unifesto against claims arising from your use of attendee data and your breach of these terms or the law. The limits on Unifesto’s liability in the [Terms](/terms#liability) apply.

## Changes {#changes}

We may update these terms. Questions: [legal@unifesto.app](mailto:legal@unifesto.app).
$md$, E'\n'));
