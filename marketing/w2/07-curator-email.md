# W2 curator email #1 (every 2 weeks)

**Send:** Thu 29 Oct, 10 AM IST, from Apex › Email campaigns (platform campaign). **Do not send until you approve it in chat or send it yourself.** Dogfoods the campaigns module.

| Field | Value |
|---|---|
| Target | `ORGANISERS_ONLY` (in code: every user who created a Space, so about one person per Space. Co-Curators and Crew are not included; widen later with a SEGMENT if you want them) |
| Subject A | Tickets, teams and your club's Space |
| Subject B (A/B, 50/50) | 2 new guides for fest season (no name: the fallback "there" reads badly in a subject) |
| Preview text | Two videos and two guides from the last two weeks, made for curators. |
| Body | HTML below (the composer takes HTML; merge vars `{{firstName}}`, `{{name}}`, `{{email}}`) |
| Links | All tracked: `utm_source=email&utm_campaign=v5-w2` |

The preview text goes as the first hidden line of the body (the campaign model has no separate preheader field).

Before sending: replace both `<YouTube link>` placeholders with the live W1 and W2 video URLs, and send a test to yourself first as a SINGLE_USER campaign to your own account (there is no separate test-send button).

## Body (HTML)

```html
<div style="display:none;max-height:0;overflow:hidden">Two videos and two guides from the last two weeks, made for curators.</div>

<p>Hi {{firstName}},</p>

<p>Fest season is here, so we've started putting out one guide a week for the people who run events on Unifesto. Here's what's out so far.</p>

<h2 style="font-size:18px">Set up your Space and team in 10 minutes</h2>
<p>Add your core team, decide who can touch the money, and give every event its own crew. Useful if your committee changed this semester.</p>
<p><a href="<YouTube link W1>">Watch the video</a> · <a href="https://www.unifesto.app/blog/how-to-organize-a-college-fest?utm_source=email&amp;utm_campaign=v5-w2">Read the 8-week fest checklist</a></p>

<h2 style="font-size:18px">Tickets, group tickets and coupons</h2>
<p>Plan an early bird that ends on its own, sell teams one group ticket where every member claims their own seat, and give your club a discount code with a limit.</p>
<p><a href="<YouTube link W2>">Watch the video</a> · <a href="https://www.unifesto.app/blog/team-registration-form?utm_source=email&amp;utm_campaign=v5-w2">Get the free team registration form template</a></p>

<h2 style="font-size:18px">One thing to try this week</h2>
<p>Open your next event in your Space and check its setup checklist. If it says 3 of 4, you're one step from publishing.</p>
<p><a href="https://space.unifesto.app/?utm_source=email&amp;utm_campaign=v5-w2">Open my Space</a></p>

<p>Reply to this email with the one thing that slows your team down on event day. We read every reply.</p>

<p>Abhinav<br>Unifesto</p>
```

## Plain-text check (what a reader sees)

Hi {{firstName}}, fest season is here... Set up your Space and team in 10 minutes (video, checklist) · Tickets, group tickets and coupons (video, template) · One thing to try: your event's setup checklist · Open my Space · Reply with what slows you down. Abhinav.

## After sending

Record opens, clicks per link and replies in the P3 baseline sheet under W2.
