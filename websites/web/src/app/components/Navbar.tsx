const navItems = ["About", "Discover", "Pricing", "Support"];

export default function Navbar() {
	return (
		<header className="site-header">
			<nav className="site-nav">
				<a className="brand-mark" href="#" aria-label="Unifesto home">
					unifesto
				</a>

				<ul className="nav-links" aria-label="Primary navigation">
					{navItems.map((item) => (
						<li key={item}>
							<a href="#">{item}</a>
						</li>
					))}
				</ul>

				<a className="cta-outline" href="#">
					Get Started
				</a>
			</nav>
		</header>
	);
}
