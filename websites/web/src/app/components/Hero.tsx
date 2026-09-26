export default function Hero() {
	return (
		<section className="hero" aria-labelledby="hero-heading">
			<h1 id="hero-heading" className="hero-title">
				<span>Optimize. Organize.</span>
				<span className="highlight">Elevate. Events</span>
			</h1>

			<div className="hero-actions">
				<a href="#" className="cta-solid">
					Discover Events
				</a>
				<a href="#" className="cta-outline">
					Host an Event
				</a>
			</div>

			<div className="hero-meta">
				<p>#UnifestoEverywhere</p>
				<ul>
					<li>
						<strong>10K+</strong> Active Members
					</li>
					<li>
						<strong>25+</strong> Events Hosted
					</li>
					<li>
						<strong>10+</strong> Collaborations
					</li>
				</ul>
			</div>

			<div className="ticker" aria-label="Partner spaces">
				<p>
					Malla Reddu University | StudLYF | GDG Hyderabad | StartupCypher
					Hyderabad | LinkedInspire
				</p>
			</div>
		</section>
	);
}
