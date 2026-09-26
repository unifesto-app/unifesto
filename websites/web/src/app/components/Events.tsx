type EventCard = {
	date: string;
	title: string;
	club: string;
};

const events: EventCard[] = [
	{ date: "16th March 2026", title: "ESummit'26", club: "Innovation and Entrepreneurship Cell" },
	{ date: "13th April 2026", title: "UNITE", club: "Marquee Film Club" },
	{ date: "4th April 2026", title: "WDS 2026", club: "MUN Club MRUH" },
	{ date: "12th March 2026", title: "Geetosav", club: "Marquee Film Club" },
	{ date: "8th March 2026", title: "Hack League", club: "GDCN Campus MRUH" },
	{ date: "28th February 2026", title: "Science Day", club: "BSC RED Dept. MRUH" },
];

export default function Events() {
	return (
		<section className="events" aria-labelledby="events-heading">
			<h2 id="events-heading" className="events-title">
				Explore Events <span>at Malla Reddu University</span>
			</h2>

			<div className="events-grid">
				{events.map((event) => (
					<article key={`${event.title}-${event.date}`} className="event-card">
						<p className="event-date">{event.date}</p>
						<div className="event-info">
							<h3>{event.title}</h3>
							<p>by {event.club}</p>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}
