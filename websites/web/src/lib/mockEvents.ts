export type EventStatus = "trending" | "upcoming" | "featured" | "past" | "completed";
export type EventCategory =
  | "Hackathon"
  | "Cultural"
  | "MUN"
  | "Film & Arts"
  | "Entrepreneurship"
  | "Science & Tech"
  | "Workshop"
  | "Sports"
  | "Ideathon";

export interface Space {
  id: string;
  name: string;
  type: "university" | "college" | "club" | "community";
  description: string;
  parentSpaceId?: string;
  image: string;
  website?: string;
}

export interface SpaceRef {
  id: string;
  name: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  speaker?: string;
}

export interface Speaker {
  name: string;
  title: string;
  organization: string;
  bio: string;
  image?: string;
  social?: {
    linkedin?: string;
    twitter?: string;
  };
}

export interface Reward {
  position: string;
  prize: string;
  description?: string;
  icon?: string;
}

export interface MockEvent {
  id: string;
  title: string;
  space: SpaceRef;
  collaborators?: SpaceRef[];  // For collaboration events
  organizer: string;  // kept for backwards compat display
  college: string;
  date: string;
  dateISO: string;
  time: string;
  category: EventCategory;
  eventType: "inPerson" | "online" | "hybrid";
  status: EventStatus[];
  tags: string[];
  description: string;
  price: number;
  spotsLeft: number;
  totalSpots: number;
  registrationDeadline: string;
  location: string;
  attendees: number;
  schedule: ScheduleItem[];
  speakers?: Speaker[];  // Guest speakers and special guests
  rewards?: Reward[];  // Prizes, certificates, goodies
  posterGradient: string;
  parentEventId?: string;  // For sub-events
  isParentEvent?: boolean;  // Indicates this event has sub-events
}

// ─── Space Data ────────────────────────────────────────────────────────────────

export const spaces: Space[] = [
  {
    id: "mruh",
    name: "Malla Reddy University",
    type: "university",
    description: "Malla Reddy University (MRUH) is one of the leading private universities in Hyderabad, Telangana. Home to diverse clubs, cells, and departments that host 25+ events every academic year.",
    image: "/orgs/mruh.png",
  },
  {
    id: "ie-cell",
    name: "Innovation & Entrepreneurship Cell",
    type: "club",
    description: "The IE Cell at MRUH is the driving force behind the local startup ecosystem. From ideathons to summits, we build tomorrow's founders today.",
    parentSpaceId: "mruh",
    image: "/orgs/tech.png",
  },
  {
    id: "gdg-mruh",
    name: "GDGon Campus MRUH",
    type: "club",
    description: "Google Developer Groups on Campus at MRUH: a community of developers building with Google technologies. We run hackathons, workshops, and open source sprints.",
    parentSpaceId: "mruh",
    image: "/orgs/tech.png",
  },
  {
    id: "marquee",
    name: "Marquee Film Club",
    type: "club",
    description: "Marquee is MRUH's official film and arts collective. We celebrate student creativity through screenings, cultural festivals, open mics, and film competitions.",
    parentSpaceId: "mruh",
    image: "/orgs/arts.png",
  },
  {
    id: "mun-mruh",
    name: "MUN Club MRUH",
    type: "club",
    description: "The MUN Club organises Model United Nations conferences and debate summits, training students in diplomacy, public speaking, and global affairs.",
    parentSpaceId: "mruh",
    image: "/orgs/event.png",
  },
  {
    id: "linkedinspire",
    name: "LinkedInspire Club",
    type: "club",
    description: "LinkedInspire helps students build their professional brand, master LinkedIn, and connect with industry, from freshers to final years.",
    parentSpaceId: "mruh",
    image: "/orgs/tech.png",
  },
  {
    id: "bos-rd",
    name: "BOS & R&D Dept. MRUH",
    type: "club",
    description: "The Board of Studies and Research & Development Department drives academic innovation at MRUH, organising Science Day, research expos, and faculty-led seminars.",
    parentSpaceId: "mruh",
    image: "/orgs/tech.png",
  },
  {
    id: "sports-committee",
    name: "Sports Committee MRUH",
    type: "club",
    description: "The Sports Committee manages all inter-departmental and university-level sporting events, from cricket and football to basketball and athletics.",
    parentSpaceId: "mruh",
    image: "/orgs/event.png",
  },
  {
    id: "soe",
    name: "School of Engineering",
    type: "college",
    description: "The School of Engineering at MRUH houses departments across CSE, ECE, Mechanical, Civil and more, and is home to several active technical clubs and cells.",
    parentSpaceId: "mruh",
    image: "/orgs/mruh.png",
  },
  {
    id: "sos",
    name: "School of Science",
    type: "college",
    description: "The School of Science at MRUH encompasses Physics, Chemistry, Mathematics, and Life Sciences departments, fostering scientific research and innovation.",
    parentSpaceId: "mruh",
    image: "/orgs/mruh.png",
  },
  {
    id: "tedx-mruh",
    name: "TEDx Malla Reddy University",
    type: "community",
    description: "TEDx MRUH is an independently organised TED event that brings together ideas worth spreading: student talks, workshops, and community conversations.",
    image: "/orgs/event.png",
  },
];

const mockEvents: MockEvent[] = [
  {
    id: "nav-nirman-3",
    title: "Nav Nirman 3.0",
    space: { id: "ie-cell", name: "Innovation & Entrepreneurship Cell" },
    organizer: "Innovation & Entrepreneurship Club",
    college: "Malla Reddy University",
    date: "Saturday, August 23, 2025",
    dateISO: "2025-08-23",
    time: "09:00 AM – 04:00 PM",
    category: "Ideathon",
    eventType: "inPerson",
    status: ["past", "completed"],
    tags: ["Completed", "Ideathon"],
    description:
      "Nav-Nirman is the flagship innovation initiative of the Innovation & Entrepreneurship Cell, Malla Reddy University – a space where creativity meets action. In its 3rd edition, Nav-Nirman evolves beyond a traditional ideathon, now blending ideation with a high-energy pitching competition.\n\nStudents will not only brainstorm bold solutions to real-world challenges but also refine, validate, and present them to a panel of experts – simulating the real startup pitch experience. With an open innovation theme, mentorship support, and exciting incentives, this is where tomorrow's changemakers begin their journey.\n\nWhether you arrive with just an idea or a fully formed concept, Nav-Nirman 3.0 is your launchpad to turn thought into tangible impact.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 300,
    registrationDeadline: "August 20, 2025",
    location: "School of Engineering Block-2, Malla Reddy University",
    attendees: 280,
    schedule: [
      { time: "09:00 AM", title: "Registration & Welcome" },
      { time: "09:30 AM", title: "Keynote: Innovation at Scale", speaker: "Guest Speaker" },
      { time: "10:00 AM", title: "Ideation Round Begins" },
      { time: "01:00 PM", title: "Lunch Break" },
      { time: "02:00 PM", title: "Pitching Competition" },
      { time: "03:30 PM", title: "Results & Awards" },
      { time: "04:00 PM", title: "Closing Ceremony" },
    ],
    rewards: [
      {
        position: "Winner",
        prize: "₹15,000 Cash Prize",
        description: "Best pitch + mentorship sessions with industry experts"
      },
      {
        position: "1st Runner Up",
        prize: "₹10,000 Cash Prize",
        description: "Incubation support + networking opportunities"
      },
      {
        position: "2nd Runner Up",
        prize: "₹5,000 Cash Prize",
        description: "Certificate of excellence + goodies"
      },
      {
        position: "All Participants",
        prize: "Certificate of Participation",
        description: "Digital certificate + event swag"
      }
    ],
    posterGradient: "linear-gradient(135deg, #3491ff 0%, #0062ff 60%, #001a4d 100%)",
  },
  {
    id: "esummit26",
    title: "ESummit'26",
    space: { id: "ie-cell", name: "Innovation & Entrepreneurship Cell" },
    organizer: "Innovation & Entrepreneurship Cell",
    college: "Malla Reddy University",
    date: "Monday, March 16, 2026",
    dateISO: "2026-03-16",
    time: "10:00 AM – 06:00 PM",
    category: "Entrepreneurship",
    eventType: "inPerson",
    status: ["featured", "trending"],
    tags: ["Trending", "Featured", "Free"],
    description:
      "The flagship entrepreneurship summit: startup pitches, VC talks, panel discussions & networking. ESummit'26 brings together the brightest student founders, mentors, and investors for a full day of action-packed programming.",
    price: 0,
    spotsLeft: 180,
    totalSpots: 1200,
    registrationDeadline: "March 14, 2026",
    location: "Auditorium, Block 3, Malla Reddy University",
    attendees: 1020,
    schedule: [
      { time: "10:00 AM", title: "Inauguration & Opening Keynote" },
      { time: "11:30 AM", title: "Startup Pitch Round 1" },
      { time: "01:00 PM", title: "Lunch & Networking" },
      { time: "02:30 PM", title: "Panel: Future of Student Entrepreneurship" },
      { time: "04:00 PM", title: "Startup Pitch Finals" },
      { time: "05:30 PM", title: "Awards & Closing" },
    ],
    speakers: [
      {
        name: "Priya Sharma",
        title: "Founder & CEO",
        organization: "TechVentures India",
        bio: "Serial entrepreneur with 3 successful exits. Passionate about empowering student founders and building the next generation of Indian startups.",
        social: {
          linkedin: "https://linkedin.com/in/priyasharma",
          twitter: "https://twitter.com/priyasharma"
        }
      },
      {
        name: "Rahul Mehta",
        title: "Partner",
        organization: "Sequoia Capital India",
        bio: "Early-stage investor focused on SaaS and consumer tech. Previously founded two startups and led product at Flipkart.",
        social: {
          linkedin: "https://linkedin.com/in/rahulmehta"
        }
      },
      {
        name: "Dr. Anita Desai",
        title: "Director",
        organization: "IIT Hyderabad Incubation Center",
        bio: "Academic entrepreneur bridging research and commercialization. Mentored 50+ student startups to funding and market success.",
        social: {
          linkedin: "https://linkedin.com/in/anitadesai"
        }
      }
    ],
    rewards: [
      {
        position: "Best Startup Pitch",
        prize: "₹50,000 Seed Funding",
        description: "Cash prize + 6 months free incubation + mentorship"
      },
      {
        position: "Runner Up",
        prize: "₹25,000 Cash Prize",
        description: "Mentorship sessions + networking with VCs"
      },
      {
        position: "People's Choice",
        prize: "₹10,000 Cash Prize",
        description: "Voted by attendees + social media promotion"
      },
      {
        position: "All Attendees",
        prize: "Networking Kit",
        description: "Event merchandise + startup resource guide + certificate"
      }
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #3491ff 50%, #5aa3ff 100%)",
  },
  {
    id: "hack-league",
    title: "Hack League",
    space: { id: "gdg-mruh", name: "GDGon Campus MRUH" },
    organizer: "GDGon Campus MRUH",
    college: "Malla Reddy University",
    date: "Saturday, March 8, 2026",
    dateISO: "2026-03-08",
    time: "10:00 AM (36 hrs)",
    category: "Hackathon",
    eventType: "inPerson",
    status: ["past", "featured"],
    tags: ["Featured", "Completed"],
    description:
      "36-hour hackathon: build fast, break things, win big. Teams of 2–4 compete across tracks: AI/ML, Web3, Social Impact, and Open Innovation. Mentors, snacks, and ₹50,000 in prizes await.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 320,
    registrationDeadline: "March 5, 2026",
    location: "Innovation Lab, R&D Center, Malla Reddy University",
    attendees: 310,
    schedule: [
      { time: "10:00 AM", title: "Check-in & Opening" },
      { time: "11:00 AM", title: "Hacking Begins" },
      { time: "Next Day 10:00 AM", title: "Submission Deadline" },
      { time: "11:00 AM", title: "Demo Day" },
      { time: "02:00 PM", title: "Results & Prizes" },
    ],
    rewards: [
      {
        position: "Overall Winner",
        prize: "₹30,000 Cash Prize",
        description: "Trophy + GitHub Pro subscription + swag kit"
      },
      {
        position: "Track Winners (4 tracks)",
        prize: "₹10,000 Each",
        description: "Certificate + tech goodies + cloud credits"
      },
      {
        position: "Best Beginner Team",
        prize: "₹5,000 Cash Prize",
        description: "Learning resources + mentorship sessions"
      },
      {
        position: "All Participants",
        prize: "Hacker Kit",
        description: "T-shirt + stickers + certificate + meals & snacks"
      }
    ],
    posterGradient: "linear-gradient(135deg, #001a4d 0%, #0062ff 50%, #3491ff 100%)",
  },
  {
    id: "wds2026",
    title: "WDS 2026",
    space: { id: "mun-mruh", name: "MUN Club MRUH" },
    organizer: "MUN Club MRUH",
    college: "Malla Reddy University",
    date: "Saturday, April 4, 2026",
    dateISO: "2026-04-04",
    time: "09:00 AM – 05:00 PM",
    category: "MUN",
    eventType: "inPerson",
    status: ["upcoming"],
    tags: ["Upcoming"],
    description:
      "World Debate Summit: Model UN committees, crisis simulations & public speaking championships. Delegates from across the community debate pressing global issues in a structured parliamentary format.",
    price: 150,
    spotsLeft: 62,
    totalSpots: 400,
    registrationDeadline: "April 1, 2026",
    location: "Conference Hall, Block 7, Malla Reddy University",
    attendees: 338,
    schedule: [
      { time: "09:00 AM", title: "Delegate Registration" },
      { time: "09:30 AM", title: "Opening Ceremony" },
      { time: "10:00 AM", title: "Committee Sessions Begin" },
      { time: "01:00 PM", title: "Lunch" },
      { time: "02:00 PM", title: "Crisis Simulation Round" },
      { time: "04:00 PM", title: "Closing Debate" },
      { time: "05:00 PM", title: "Awards Night" },
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #1a75ff 50%, #3491ff 100%)",
  },
  {
    id: "devsprints",
    title: "DevSprints",
    space: { id: "gdg-mruh", name: "GDGon Campus MRUH" },
    organizer: "GDGon Campus MRUH",
    college: "Malla Reddy University",
    date: "Friday, April 18, 2026",
    dateISO: "2026-04-18",
    time: "10:00 AM – 05:00 PM",
    category: "Workshop",
    eventType: "inPerson",
    status: ["upcoming"],
    tags: ["Upcoming", "Free"],
    description:
      "A hands-on 1-day sprint series covering: AI/ML fundamentals, Web Dev with Next.js, Cloud & DevOps, and Open Source contribution. Each track is beginner-friendly with side missions for advanced learners.",
    price: 0,
    spotsLeft: 45,
    totalSpots: 180,
    registrationDeadline: "April 15, 2026",
    location: "Lab Complex, Block 2, Malla Reddy University",
    attendees: 135,
    schedule: [
      { time: "10:00 AM", title: "Introduction & Setup" },
      { time: "10:30 AM", title: "Track 1: AI/ML Fundamentals" },
      { time: "12:00 PM", title: "Track 2: Web Dev with Next.js" },
      { time: "01:30 PM", title: "Lunch" },
      { time: "02:30 PM", title: "Track 3: Cloud & DevOps" },
      { time: "04:00 PM", title: "Track 4: Open Source Sprint" },
      { time: "05:00 PM", title: "Project Showcase & Close" },
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #0080ff 50%, #3491ff 100%)",
  },
  {
    id: "pitch-perfect",
    title: "Pitch Perfect",
    space: { id: "ie-cell", name: "Innovation & Entrepreneurship Cell" },
    organizer: "Innovation & Entrepreneurship Cell",
    college: "Malla Reddy University",
    date: "Wednesday, April 22, 2026",
    dateISO: "2026-04-22",
    time: "11:00 AM – 03:00 PM",
    category: "Entrepreneurship",
    eventType: "inPerson",
    status: ["upcoming", "trending"],
    tags: ["Trending", "Free", "New"],
    description:
      "Startup pitching competition. Present your idea, get mentored live, and compete for seed funding & incubation support. The best idea wins ₹25,000 in prizes and a fast-track to the incubator.",
    price: 0,
    spotsLeft: 28,
    totalSpots: 200,
    registrationDeadline: "April 19, 2026",
    location: "Seminar Hall, Block 5, Malla Reddy University",
    attendees: 172,
    schedule: [
      { time: "11:00 AM", title: "Welcome & Briefing" },
      { time: "11:30 AM", title: "Pitch Round 1 (Top 10 Teams)" },
      { time: "01:00 PM", title: "Mentorship Break" },
      { time: "02:00 PM", title: "Grand Finale (Top 3)" },
      { time: "02:45 PM", title: "Judging & Results" },
      { time: "03:00 PM", title: "Prize Distribution" },
    ],
    rewards: [
      {
        position: "Winner",
        prize: "₹25,000 Seed Funding",
        description: "Fast-track incubation + 3 months mentorship"
      },
      {
        position: "1st Runner Up",
        prize: "₹15,000 Cash Prize",
        description: "Mentorship sessions + pitch deck review"
      },
      {
        position: "2nd Runner Up",
        prize: "₹10,000 Cash Prize",
        description: "Business plan consultation + resources"
      },
      {
        position: "All Finalists",
        prize: "Entrepreneur Kit",
        description: "Certificate + startup resources + networking access"
      }
    ],
    posterGradient: "linear-gradient(135deg, #3491ff 0%, #0062ff 50%, #004acc 100%)",
  },
  {
    id: "unite",
    title: "UNITE",
    space: { id: "marquee", name: "Marquee Film Club" },
    organizer: "Marquee Film Club",
    college: "Malla Reddy University",
    date: "Monday, April 13, 2026",
    dateISO: "2026-04-13",
    time: "06:00 PM – 09:00 PM",
    category: "Film & Arts",
    eventType: "inPerson",
    status: ["upcoming", "trending"],
    tags: ["Trending", "Free"],
    description:
      "A celebration of independent cinema: short film screenings, photography exhibitions, competitions & awards night. UNITE is Marquee's annual showcase of creative talent across the community.",
    price: 0,
    spotsLeft: 230,
    totalSpots: 650,
    registrationDeadline: "April 11, 2026",
    location: "Open Air Theatre, Malla Reddy University",
    attendees: 420,
    schedule: [
      { time: "06:00 PM", title: "Red Carpet & Registration" },
      { time: "06:30 PM", title: "Short Film Screenings" },
      { time: "07:30 PM", title: "Photography Exhibition" },
      { time: "08:00 PM", title: "Awards Ceremony" },
      { time: "08:45 PM", title: "Closing Performance" },
    ],
    posterGradient: "linear-gradient(135deg, #1a75ff 0%, #3491ff 50%, #5aa3ff 100%)",
  },
  {
    id: "geetotsav",
    title: "Geetotsav",
    space: { id: "marquee", name: "Marquee Film Club" },
    organizer: "Marquee Film Club",
    college: "Malla Reddy University",
    date: "Thursday, March 12, 2026",
    dateISO: "2026-03-12",
    time: "05:00 PM – 10:00 PM",
    category: "Cultural",
    eventType: "inPerson",
    status: ["past", "featured"],
    tags: ["Featured", "Completed"],
    description:
      "Annual cultural fest with live music, classical & contemporary dance, art installations & open mics. Geetotsav is the biggest cultural night of the academic year.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 2100,
    registrationDeadline: "March 10, 2026",
    location: "Main Campus Grounds, Malla Reddy University",
    attendees: 2050,
    schedule: [
      { time: "05:00 PM", title: "Entry & Art Exhibition" },
      { time: "06:00 PM", title: "Live Music Performances" },
      { time: "07:00 PM", title: "Dance Competition Finals" },
      { time: "08:30 PM", title: "Open Mic" },
      { time: "09:30 PM", title: "Closing Act" },
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #3491ff 50%, #0062ff 100%)",
  },
  {
    id: "linkedinspire-summit",
    title: "LinkedInspire Summit",
    space: { id: "linkedinspire", name: "LinkedInspire Club" },
    organizer: "LinkedInspire Club",
    college: "Malla Reddy University",
    date: "Monday, May 5, 2026",
    dateISO: "2026-05-05",
    time: "10:00 AM – 02:00 PM",
    category: "Workshop",
    eventType: "inPerson",
    status: ["upcoming", "featured"],
    tags: ["Featured", "Free", "New"],
    description:
      "Professional networking & LinkedIn masterclass: build your personal brand, craft a standout profile, and land your dream internship or job. Featuring industry professionals as guest speakers.",
    price: 0,
    spotsLeft: 120,
    totalSpots: 500,
    registrationDeadline: "May 2, 2026",
    location: "Auditorium, Block 3, Malla Reddy University",
    attendees: 380,
    schedule: [
      { time: "10:00 AM", title: "Welcome & Intro", speaker: "Club President" },
      { time: "10:30 AM", title: "LinkedIn Profile Masterclass", speaker: "Guest Speaker" },
      { time: "12:00 PM", title: "Networking Lunch" },
      { time: "01:00 PM", title: "Personal Branding Workshop" },
      { time: "01:45 PM", title: "Q&A & Close" },
    ],
    speakers: [
      {
        name: "Vikram Singh",
        title: "Head of Talent Acquisition",
        organization: "Microsoft India",
        bio: "15+ years in tech recruitment. Helped thousands of students land their dream jobs through strategic personal branding and networking.",
        social: {
          linkedin: "https://linkedin.com/in/vikramsingh"
        }
      },
      {
        name: "Neha Kapoor",
        title: "Career Coach & LinkedIn Expert",
        organization: "CareerCraft",
        bio: "Former HR leader turned career coach. Specializes in helping students build powerful LinkedIn profiles that attract recruiters.",
        social: {
          linkedin: "https://linkedin.com/in/nehakapoor",
          twitter: "https://twitter.com/nehakapoor"
        }
      }
    ],
    rewards: [
      {
        position: "All Attendees",
        prize: "Professional Development Kit",
        description: "Certificate of attendance + LinkedIn profile review + career resources guide"
      },
      {
        position: "Best Profile Makeover",
        prize: "Premium Career Coaching",
        description: "3 one-on-one sessions with career experts"
      }
    ],
    posterGradient: "linear-gradient(135deg, #001a4d 0%, #0062ff 50%, #1a75ff 100%)",
  },
  {
    id: "research-expo",
    title: "Research Expo",
    space: { id: "bos-rd", name: "BOS & R&D Dept. MRUH" },
    organizer: "BOS & R&D Dept. MRUH",
    college: "Malla Reddy University",
    date: "Friday, May 1, 2026",
    dateISO: "2026-05-01",
    time: "10:00 AM – 04:00 PM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["upcoming", "featured"],
    tags: ["Featured", "Free"],
    description:
      "Student research showcase: present your paper, project, or prototype to a panel of industry experts and faculty. Open to all departments. Certificate of participation for all presenters.",
    price: 0,
    spotsLeft: 85,
    totalSpots: 350,
    registrationDeadline: "April 27, 2026",
    location: "R&D Center, 2nd Floor, Malla Reddy University",
    attendees: 265,
    schedule: [
      { time: "10:00 AM", title: "Registration & Setup" },
      { time: "10:30 AM", title: "Opening Address" },
      { time: "11:00 AM", title: "Paper Presentations – Round 1" },
      { time: "01:00 PM", title: "Lunch" },
      { time: "02:00 PM", title: "Project/Prototype Showcase" },
      { time: "03:30 PM", title: "Expert Feedback & Awards" },
    ],
    speakers: [
      {
        name: "Dr. Rajesh Kumar",
        title: "Chief Scientist",
        organization: "DRDO Hyderabad",
        bio: "Leading researcher in aerospace engineering with 20+ patents. Passionate about nurturing young researchers and promoting innovation in defense technology.",
        social: {
          linkedin: "https://linkedin.com/in/drrajeshkumar"
        }
      },
      {
        name: "Prof. Meera Iyer",
        title: "Head of Research",
        organization: "IIIT Hyderabad",
        bio: "AI and Machine Learning expert with 100+ publications. Actively mentors student research projects and promotes interdisciplinary collaboration.",
        social: {
          linkedin: "https://linkedin.com/in/meeraiyer"
        }
      }
    ],
    posterGradient: "linear-gradient(135deg, #001a4d 0%, #004acc 50%, #0062ff 100%)",
  },
  {
    id: "frames-fest",
    title: "Frames Fest",
    space: { id: "marquee", name: "Marquee Film Club" },
    organizer: "Marquee Film Club",
    college: "Malla Reddy University",
    date: "Saturday, May 2, 2026",
    dateISO: "2026-05-02",
    time: "04:00 PM – 08:00 PM",
    category: "Film & Arts",
    eventType: "inPerson",
    status: ["upcoming"],
    tags: ["Upcoming", "Free"],
    description:
      "Short film festival: submit your film, screen it live, and compete for the Best Director award. Open to all students. All genres welcome.",
    price: 0,
    spotsLeft: 200,
    totalSpots: 450,
    registrationDeadline: "April 28, 2026",
    location: "Mini Theatre, Malla Reddy University",
    attendees: 250,
    schedule: [
      { time: "04:00 PM", title: "Registration" },
      { time: "04:30 PM", title: "Screening Block 1" },
      { time: "06:00 PM", title: "Intermission" },
      { time: "06:30 PM", title: "Screening Block 2" },
      { time: "07:30 PM", title: "Jury Discussion & Awards" },
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #1a5acc 50%, #3491ff 100%)",
  },
  {
    id: "science-day",
    title: "National Science Day 2026",
    space: { id: "bos-rd", name: "BOS & R&D Dept. MRUH" },
    collaborators: [
      { id: "soe", name: "School of Engineering" },
      { id: "sos", name: "School of Science" },
    ],
    organizer: "BOS & R&D Dept. MRUH",
    college: "Malla Reddy University",
    date: "Saturday, February 28, 2026",
    dateISO: "2026-02-28",
    time: "09:00 AM – 05:00 PM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["past"],
    tags: ["Completed", "Collaboration"],
    description:
      "National Science Day celebrations: a collaborative event organized by BOS & R&D Department with School of Engineering and School of Science. Features 4 sub-events including exhibitions, quizzes, lab demos & talks. Marking Raman Effect Day with science all day.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 900,
    registrationDeadline: "February 25, 2026",
    location: "Science Block, Malla Reddy University",
    attendees: 870,
    isParentEvent: true,
    schedule: [
      { time: "09:00 AM", title: "Inauguration" },
      { time: "09:30 AM", title: "Science Quiz Competition" },
      { time: "11:00 AM", title: "Lab Demonstrations" },
      { time: "01:00 PM", title: "Lunch" },
      { time: "02:00 PM", title: "Guest Talk: History of Science" },
      { time: "04:00 PM", title: "Science Exhibition" },
    ],
    posterGradient: "linear-gradient(135deg, #001a4d 0%, #003d99 50%, #0062ff 100%)",
  },
  {
    id: "science-day-quiz",
    title: "Science Quiz Competition",
    space: { id: "soe", name: "School of Engineering" },
    organizer: "School of Engineering",
    college: "Malla Reddy University",
    date: "Saturday, February 28, 2026",
    dateISO: "2026-02-28",
    time: "09:30 AM – 11:00 AM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["past"],
    tags: ["Completed", "Sub-event"],
    description:
      "Inter-department science quiz competition covering Physics, Chemistry, Biology, and Mathematics. Part of National Science Day 2026 celebrations.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 200,
    registrationDeadline: "February 25, 2026",
    location: "Auditorium, Science Block",
    attendees: 185,
    parentEventId: "science-day",
    schedule: [
      { time: "09:30 AM", title: "Registration & Team Formation" },
      { time: "10:00 AM", title: "Round 1: Written Quiz" },
      { time: "10:30 AM", title: "Round 2: Rapid Fire" },
      { time: "11:00 AM", title: "Prize Distribution" },
    ],
    posterGradient: "linear-gradient(135deg, #0062ff 0%, #3491ff 50%, #5aa3ff 100%)",
  },
  {
    id: "science-day-lab-demo",
    title: "Interactive Lab Demonstrations",
    space: { id: "soe", name: "School of Engineering" },
    organizer: "School of Engineering",
    college: "Malla Reddy University",
    date: "Saturday, February 28, 2026",
    dateISO: "2026-02-28",
    time: "11:00 AM – 01:00 PM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["past"],
    tags: ["Completed", "Sub-event"],
    description:
      "Hands-on lab demonstrations across Physics, Chemistry, and Engineering labs. Students can interact with experiments and learn from faculty. Part of National Science Day 2026.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 300,
    registrationDeadline: "February 25, 2026",
    location: "Lab Complex, Science Block",
    attendees: 280,
    parentEventId: "science-day",
    schedule: [
      { time: "11:00 AM", title: "Physics Lab Demo" },
      { time: "11:30 AM", title: "Chemistry Lab Demo" },
      { time: "12:00 PM", title: "Engineering Lab Demo" },
      { time: "12:30 PM", title: "Q&A with Faculty" },
    ],
    posterGradient: "linear-gradient(135deg, #1a75ff 0%, #3491ff 50%, #0062ff 100%)",
  },
  {
    id: "science-day-talk",
    title: "History of Science: A Journey",
    space: { id: "soe", name: "School of Engineering" },
    organizer: "School of Engineering",
    college: "Malla Reddy University",
    date: "Saturday, February 28, 2026",
    dateISO: "2026-02-28",
    time: "02:00 PM – 03:30 PM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["past"],
    tags: ["Completed", "Sub-event"],
    description:
      "Guest lecture on the evolution of scientific thought from ancient times to modern discoveries. Special focus on Indian contributions to science. Part of National Science Day 2026.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 250,
    registrationDeadline: "February 25, 2026",
    location: "Main Auditorium, Block 3",
    attendees: 235,
    parentEventId: "science-day",
    schedule: [
      { time: "02:00 PM", title: "Introduction", speaker: "Dr. Rajesh Kumar" },
      { time: "02:15 PM", title: "Ancient Scientific Discoveries" },
      { time: "02:45 PM", title: "Modern Science & Technology" },
      { time: "03:15 PM", title: "Q&A Session" },
    ],
    posterGradient: "linear-gradient(135deg, #004acc 0%, #0062ff 50%, #1a75ff 100%)",
  },
  {
    id: "science-day-exhibition",
    title: "Science Exhibition & Projects",
    space: { id: "sos", name: "School of Science" },
    organizer: "School of Science",
    college: "Malla Reddy University",
    date: "Saturday, February 28, 2026",
    dateISO: "2026-02-28",
    time: "04:00 PM – 05:00 PM",
    category: "Science & Tech",
    eventType: "inPerson",
    status: ["past"],
    tags: ["Completed", "Sub-event"],
    description:
      "Student science project exhibition showcasing innovative research and experiments. Open to all departments. Best projects awarded. Part of National Science Day 2026.",
    price: 0,
    spotsLeft: 0,
    totalSpots: 400,
    registrationDeadline: "February 25, 2026",
    location: "Exhibition Hall, Science Block",
    attendees: 370,
    parentEventId: "science-day",
    schedule: [
      { time: "04:00 PM", title: "Exhibition Opens" },
      { time: "04:30 PM", title: "Judging Round" },
      { time: "04:45 PM", title: "Best Project Awards" },
    ],
    posterGradient: "linear-gradient(135deg, #003d99 0%, #0062ff 50%, #3491ff 100%)",
  },
];

// ─── Mock API ────────────────────────────────────────────────────────────────

export function getAllEvents(): MockEvent[] {
  return mockEvents;
}

export function getEventById(id: string): MockEvent | undefined {
  return mockEvents.find((e) => e.id === id);
}

export function filterEvents({
  query = "",
  category = "All",
  status = "all",
  price = "all",
  dateRange = "all",
}: {
  query?: string;
  category?: string;
  status?: string;
  price?: "all" | "free" | "paid";
  dateRange?: "all" | "today" | "week" | "upcoming";
}): MockEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  return mockEvents.filter((e) => {
    const matchesQuery =
      !query ||
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.organizer.toLowerCase().includes(query.toLowerCase()) ||
      e.description.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All" || e.category === category;
    const matchesStatus = status === "all" || e.status.includes(status as EventStatus);
    const matchesPrice =
      price === "all" ||
      (price === "free" && e.price === 0) ||
      (price === "paid" && e.price > 0);
    const eventDate = new Date(e.dateISO);
    const matchesDate =
      dateRange === "all" ||
      (dateRange === "today" && eventDate.toDateString() === today.toDateString()) ||
      (dateRange === "week" && eventDate >= today && eventDate <= weekEnd) ||
      (dateRange === "upcoming" && eventDate >= today);
    return matchesQuery && matchesCategory && matchesStatus && matchesPrice && matchesDate;
  });
}

export const ALL_CATEGORIES: string[] = [
  "All",
  "Hackathon",
  "Ideathon",
  "Cultural",
  "MUN",
  "Film & Arts",
  "Entrepreneurship",
  "Science & Tech",
  "Workshop",
  "Sports",
];

export const STATUS_TABS = [
  { key: "all", label: "All Events" },
  { key: "trending", label: "Trending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "featured", label: "Featured" },
];

export const DATE_FILTERS = [
  { key: "all", label: "Any time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "upcoming", label: "Upcoming" },
];

export const PRICE_FILTERS = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

// ─── Event Relationship API ──────────────────────────────────────────────────

export function getSubEvents(parentEventId: string): MockEvent[] {
  return mockEvents.filter((e) => e.parentEventId === parentEventId);
}

export function getParentEvent(eventId: string): MockEvent | undefined {
  const event = getEventById(eventId);
  if (!event?.parentEventId) return undefined;
  return getEventById(event.parentEventId);
}

export function isCollaborationEvent(event: MockEvent): boolean {
  return !!event.collaborators && event.collaborators.length > 0;
}

export function getAllCollaborators(event: MockEvent): SpaceRef[] {
  return [event.space, ...(event.collaborators || [])];
}

// ─── Space API ─────────────────────────────────────────────────────────────────

export function getAllSpaces(): Space[] {
  return spaces;
}

export function getSpaceById(id: string): Space | undefined {
  return spaces.find((o) => o.id === id);
}

export function getEventsBySpace(spaceId: string): MockEvent[] {
  return mockEvents.filter((e) => e.space.id === spaceId);
}

export function getSubSpaces(parentSpaceId: string): Space[] {
  return spaces.filter((o) => o.parentSpaceId === parentSpaceId);
}

/** Returns all space IDs in the subtree rooted at spaceId (inclusive). */
export function getAllSpaceIdsInTree(spaceId: string): string[] {
  const children = spaces.filter((o) => o.parentSpaceId === spaceId);
  return [spaceId, ...children.flatMap((c) => getAllSpaceIdsInTree(c.id))];
}

/** Events by space + all sub-spaces (recursive). */
export function getEventsBySpaceTree(spaceId: string): MockEvent[] {
  const ids = new Set(getAllSpaceIdsInTree(spaceId));
  return mockEvents.filter((e) => ids.has(e.space.id));
}

export function getSpacesByType(type: Space["type"]): Space[] {
  return spaces.filter((o) => o.type === type);
}

export function getParentChain(spaceId: string): Space[] {
  const chain: Space[] = [];
  let current = getSpaceById(spaceId);
  while (current?.parentSpaceId) {
    const parent = getSpaceById(current.parentSpaceId);
    if (parent) chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export const SPACE_TYPE_LABELS: Record<Space["type"], string> = {
  university: "University",
  college: "College",
  club: "Club",
  community: "Community",
};
