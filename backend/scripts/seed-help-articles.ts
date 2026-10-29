/*
 * Starter help articles (K17). Each one is written from what the code does
 * today; check them in Apex → Help before they go live.
 *
 *   npx ts-node -T scripts/seed-help-articles.ts            # add as DRAFT (review in Apex, then publish)
 *   npx ts-node -T scripts/seed-help-articles.ts --publish  # add as PUBLISHED
 *
 * Only creates articles whose slug doesn't exist yet, so a re-run never
 * overwrites an article someone already edited in Apex. unifesto.app/help stays
 * hidden until at least one article is PUBLISHED.
 */
import 'dotenv/config';
import { HelpArticleStatus, PrismaClient } from '@prisma/client';

export interface SeedArticle {
  slug: string;
  title: string;
  category: string;
  body: string;
}

export const ARTICLES: SeedArticle[] = [
  {
    slug: 'find-my-ticket',
    title: 'Where to find my ticket',
    category: 'Tickets',
    body: `Your ticket lives in two places once you register.

- **In the app:** open the **My tickets** tab. Tap a ticket to see its QR code. Tickets you have opened once stay on your phone, so they still show without a signal at the venue.
- **On the web:** go to [unifesto.app/tickets](https://unifesto.app/tickets) and sign in with the email you registered with. We send you a code to confirm it's you.

We also email you a confirmation when your registration goes through.

## I can't see my ticket

- Check you are signed in with the same email or phone you registered with.
- If you paid but no ticket shows, see [My payment went through but I have no ticket](/help/payment-but-no-ticket).
- If you were invited to a group, you need to claim your seat first. See [Claim my seat in a group](/help/claim-group-seat).`,
  },
  {
    slug: 'cancel-free-registration',
    title: 'Cancel my registration',
    category: 'Tickets',
    body: `## Free tickets

Open the ticket in the app and tap **Cancel registration**. You can add a reason for the organiser. Your seat goes back to the event so someone else can take it.

## Paid tickets

A paid ticket can't be cancelled on its own. Ask for a refund instead: the ticket is cancelled once the refund goes through. See [How to ask for a refund](/help/request-a-refund).

## Changed your mind?

Only the organiser can restore a cancelled registration. Contact them, or [ask us](/help/contact) and we will pass it on.`,
  },
  {
    slug: 'waiting-list',
    title: 'How the waiting list works',
    category: 'Tickets',
    body: `When a ticket is sold out, the organiser can open a waiting list for it. Join it from the event page.

## What happens next

The organiser offers spots to people on the list, usually in the order they joined.

- **Free ticket:** your spot is confirmed straight away and your ticket appears in **My tickets**.
- **Paid ticket:** we hold the seat for you and send you the offer. Pay from the app to confirm it.

An offer doesn't expire on its own, but the organiser can take it back and offer the seat to someone else. Pay as soon as you can.

You can see the lists you are on under **Waiting list** in the app.`,
  },
  {
    slug: 'request-a-refund',
    title: 'How to ask for a refund',
    category: 'Refunds',
    body: `1. Open the ticket in the app.
2. Tap **Request a refund**.
3. Tell us why, and send the request.

## Who decides

The event's organiser checks your request first. They either send it to Unifesto or decline it with a reason. Unifesto then makes the final decision and sends the money. We email you at each step.

## Good to know

- You can only have one open request per ticket. Wait for it to be decided before asking again.
- Once the event has ended, you can no longer ask for a refund in the app. Contact the organiser or [our support team](/help/contact) instead.
- Free tickets have nothing to refund. Cancel them from the ticket instead.

See [What gets refunded and when](/help/refund-amount-and-timing) for the amount.`,
  },
  {
    slug: 'refund-amount-and-timing',
    title: 'What gets refunded and when',
    category: 'Refunds',
    body: `## The amount

An approved refund returns the ticket's price. The processing fee you paid at checkout is not refunded. Unifesto can also approve part of the price instead of all of it.

If you bought add-ons or extra group seats, those can be refunded too.

## Where it goes

The money goes back to the card, UPI account or bank you paid with, through Razorpay. We can't send it anywhere else.

## How long it takes

We send the refund as soon as it is approved, and email you when it's on its way. After that, how long it takes to show in your account depends on your bank.

## When you get everything back

If we take your payment but can't give you a seat (for example the ticket sold out while you were paying), we refund the full amount, fee included, automatically. You don't need to ask.`,
  },
  {
    slug: 'event-cancelled',
    title: 'What happens if an event is cancelled',
    category: 'Refunds',
    body: `If an organiser cancels an event, we open a refund for every paid ticket automatically. You don't need to ask.

- You get the ticket's price back. The processing fee is not refunded.
- Unifesto checks each refund and sends it to the payment method you used.
- A refund request you already had open moves straight to Unifesto.

Free registrations are simply cancelled.

If the event was moved to a new date instead of cancelled, your ticket stays valid. If you can't make the new date, [ask for a refund](/help/request-a-refund).`,
  },
  {
    slug: 'payment-but-no-ticket',
    title: 'My payment went through but I have no ticket',
    category: 'Refunds',
    body: `First, pull down to refresh **My tickets** in the app. Payments sometimes take a minute to confirm.

## If the ticket still isn't there

- **The ticket sold out while you were paying:** we refund the full amount, fee included, automatically. You will get an email about it.
- **Anything else:** [contact support](/help/contact) with the event name and the payment ID from Razorpay's email or SMS. We match it to your booking and either issue your ticket or refund you.

Please don't pay a second time while you wait.`,
  },
  {
    slug: 'group-tickets',
    title: 'How group and team tickets work',
    category: 'Groups',
    body: `Some tickets are for a group or a team. One person, the **lead**, books and pays for every seat in one go.

## For the lead

- After paying, invite each member by email from the group screen in the app.
- You can add members later. Their seats stay open until someone claims them.
- If a member can't come, you can invite someone else to the open seat.
- If you don't need a seat any more, you can release it. Releasing doesn't give a refund.

## For members

Each member claims their own seat with the invite. See [Claim my seat in a group](/help/claim-group-seat).

## At the door

The group shares the lead's QR code, and staff pick who is there. A member who claimed a seat also has their own ticket, which checks in only that member.`,
  },
  {
    slug: 'claim-group-seat',
    title: 'Claim my seat in a group',
    category: 'Groups',
    body: `When a group lead invites you, you get an email with a link.

1. Open the link on your phone. It opens the Unifesto app, or takes you to the store if you don't have it.
2. Sign in with the email address the invite was sent to.
3. Answer any questions the organiser asks, then claim the seat.

Your seat then shows under **My tickets**.

## Problems

- **"Someone has already claimed this seat":** ask your lead to send you a new invite.
- **"This claim link is invalid or has expired":** the lead may have changed the invite. Ask them for a new one.
- **Can't go any more?** Give the seat back from your ticket. It returns to the group so your lead can invite someone else.`,
  },
  {
    slug: 'check-in',
    title: 'Checking in at the event',
    category: 'Check-in',
    body: `At the venue, show your ticket's QR code. Event staff scan it with the Unifesto app.

- Open the ticket before you reach the gate. Tickets you have opened once stay on your phone, so a weak signal won't stop you.
- Turn your screen brightness up to help the scanner.
- No phone? Staff can find you by name or email and check you in by hand.

## More than one check-in point

Some events check you in more than once, for example at the entrance and again for meals or a workshop. Use the same QR code each time.

## Groups

The lead's QR code covers the group, and staff pick who is there. Members who claimed their own seat can use their own ticket.`,
  },
  {
    slug: 'get-my-certificate',
    title: 'Get my certificate',
    category: 'Certificates',
    body: `Certificates come from the event's organiser, usually after the event ends.

When the organiser issues yours, we email you ("Your certificate for ...") and it appears in the app under **My certificates**, where you can open and share it.

## Who gets one

The organiser decides. They can issue certificates to everyone who checked in, everyone registered, or a list they pick. If you didn't check in at the door, you may not be on the list.

## Mine hasn't arrived

- Check your spam folder for the email.
- Make sure you are signed in with the account you registered with.
- Ask the organiser. Only they can issue or reissue a certificate, and they can only do so for a limited time after the event.`,
  },
  {
    slug: 'verify-a-certificate',
    title: 'Check that a certificate is real',
    category: 'Certificates',
    body: `Every Unifesto certificate has its own verification code.

To check one, go to **unifesto.app/verify/** followed by the code, or scan the QR code if the certificate has one. The page tells you whether the certificate is genuine and shows the details it was issued with.

If the organiser has revoked a certificate, the page says so. A code that shows nothing was not issued by Unifesto.`,
  },
  {
    slug: 'delete-my-account',
    title: 'Delete my account',
    category: 'Account',
    body: `In the app, go to **Account**, then **Delete account**.

## What happens

- Nothing is removed straight away. Your account closes **30 days** after you ask.
- Until then you can still sign in, and you can cancel the deletion at any time.
- After 30 days your personal details are erased. Records we must keep by law, such as payments, are kept without your name on them.

## What can stop it

- **You own a Space.** Transfer it to someone else or archive it first.
- **You have a ticket for an event that hasn't ended.** Cancel it or ask for a refund first. A ticket with a refund request already in review doesn't block deletion.

We check these again on the day your account is due to close.`,
  },
];

async function main() {
  const publish = process.argv.includes('--publish');
  const status = publish ? HelpArticleStatus.PUBLISHED : HelpArticleStatus.DRAFT;
  const prisma = new PrismaClient();
  try {
    let created = 0;
    for (const a of ARTICLES) {
      const exists = await prisma.helpArticle.findUnique({ where: { slug: a.slug }, select: { id: true } });
      if (exists) {
        console.log(`skip   ${a.slug} (already there)`);
        continue;
      }
      await prisma.helpArticle.create({ data: { ...a, status } });
      created++;
      console.log(`create ${a.slug}`);
    }
    console.log(`\n${created} created as ${status}, ${ARTICLES.length - created} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
