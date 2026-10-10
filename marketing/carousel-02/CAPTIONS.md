# Carousel 02: "Bring Unifesto to your college"

Files: `png/01–07.png` (Instagram, 1080×1350) · `unifesto-carousel-02-linkedin.pdf` (LinkedIn document post)
Source: `carousel.html` (monochrome cosmos, all dark slides; wordmark and app icon from `../brand-2026/`)

---

## LinkedIn (upload the PDF as a Document)

Bring Unifesto to your college. Power up your events. 🚀

Fests, hackathons, workshops, club meetups. Your campus runs on events, and running them shouldn’t mean juggling Google Forms, UPI screenshots and WhatsApp groups.

With a Unifesto Space, your college gets one place for:
🎟️ Registrations and ticketing, free or paid
👥 Team roles for curators, co-curators and crew
📲 QR check-ins on event day
📜 Certificates, reports and payouts, all sorted

Here’s how to get started:

1️⃣ Check if your college is already here. Go to 👉 unifesto.app/spaces
We’ve already set up Spaces for 75+ institutions across Andhra Pradesh and Telangana, from IIT Hyderabad and NIT Warangal to Andhra University and JNTU.

2️⃣ Found it? Download the Unifesto app and join your college’s Space to stay on top of every event on campus.

3️⃣ Not listed? Request your college’s Space today at 👉 unifesto.app/request-space

⚠️ Please inform your college management before you request a Space for your institution.

Your campus. Your events. One Space. ✨

#Unifesto #CollegeEvents #CampusLife #Hackathons #StudentCommunity #EventManagement #Hyderabad #AndhraPradesh #Telangana

Terms and Conditions and Privacy Policy apply. Spaces for institutions are not affiliated with or endorsed by the institution unless they are marked as verified.

---

## Re-render after edits

The command below re-exports the PNGs. The PDF was built by printing each slide on its own (`?s=N`) and merging the pages, because printing all slides in one pass flattens the horizon arc on every page but the last.

```bash
cd marketing/carousel-02 && C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; F="file://$PWD/carousel.html"; for i in 1 2 3 4 5 6 7; do "$C" --headless=new --hide-scrollbars --window-size=1080,1350 --virtual-time-budget=6000 --screenshot="$PWD/png/0$i.png" "$F?s=$i"; done
```
