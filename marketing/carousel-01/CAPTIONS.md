# Carousel 01: "Your event deserves more than a Google Form"

Files: `png/01–09.png` (Instagram, 1080×1350) · `unifesto-carousel-linkedin.pdf` (LinkedIn document post)
Source: `carousel.html` (edit, then re-render; see bottom)

---

## LinkedIn (upload the PDF as a Document, title: "4 things the best-run events get right")

Most college fests and community events in India still run on six tools.

A Google Form. An Excel sheet. UPI screenshots. Five WhatsApp groups. A printed list at the gate. Canva certificates, made one by one.

And a team matching payments to names at 2 AM.

We've watched 10,000+ people walk through the door at events on Unifesto. The ones that run smoothly get four things right:

1. Registration: ask less, convert more
2. Check-in: a live count, not a guess
3. Money: every rupee accounted for
4. After: certificates, sponsor leads and a report, without the extra week

Swipe through. Save it for your next event.

If you run a club, a fest or a community, what's the one tool you'd never go back to? 👇

---
Free for RSVP events → unifesto.app/organisers

> First comment (post it yourself, right after publishing): "Going, not organising? The Unifesto app shows what's on near you. Free on iOS and Android: unifesto.app/app"
> Keep links out of the post body; LinkedIn reach drops when the body has an outbound link.

#events #eventmanagement #collegefest #community #startupindia

---

## Instagram

Your event deserves more than a Google Form 📋❌

4 things the best-run events get right ➝ swipe

🎟 Ask less, convert more
📲 A live count at the door
💸 Know where every rupee went
🏅 The event isn't over when the lights go off

Running a fest, club or meetup? Host it on Unifesto. Free for RSVP events.
Going to one? Find what's on near you in the Unifesto app.

🔖 Save this for your next event
📤 Send it to the person who runs yours

Link in bio.

#unifesto #collegefest #eventplanning #eventorganiser #hyderabadevents #techfest #hackathon #studentlife #clubs #communityevents #eventsinindia #festseason

> Alt text for slide 1: "Black slide with the text: Your event deserves more than a Google Form. 4 things the best-run events get right."

---

## Posting notes

- **Timing:** LinkedIn Tue–Thu, 8–10 AM IST. Instagram 7–9 PM IST.
- **First hour matters most:** have the team reply to every comment within 60 minutes; replies count as engagement and extend reach.
- **Instagram:** add a trending low-volume audio to the carousel (carousels with audio can surface in Reels), and share slide 1 to Stories with a link sticker.
- **LinkedIn:** founders post it from their personal profiles too (personal posts reach far more than company pages), then reshare from the Unifesto page.
- **Repurpose:** each lesson slide (03–06) works as a standalone post later in the week.

## Re-render after edits

```bash
cd marketing/carousel-01 && C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; F="file://$PWD/carousel.html"; for i in 1 2 3 4 5 6 7 8 9; do "$C" --headless=new --hide-scrollbars --window-size=1080,1350 --virtual-time-budget=6000 --screenshot="$PWD/png/0$i.png" "$F?s=$i"; done; "$C" --headless=new --virtual-time-budget=6000 --no-pdf-header-footer --print-to-pdf="$PWD/unifesto-carousel-linkedin.pdf" "$F"
```
