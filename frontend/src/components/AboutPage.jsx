import { Link, useNavigate } from "react-router-dom";
import cloudsBg from "../assets/clouds-bg.png";
import "./InfoPages.css";

const ABOUT_HIGHLIGHTS = [
  {
    title: "Domestic focus",
    description:
      "Built around routes inside Nepal, with schedules and prices tailored for local travel needs.",
  },
  {
    title: "Simple booking flow",
    description:
      "Search routes, compare options, and complete a booking in a few clear steps.",
  },
  {
    title: "Trusted support",
    description:
      "Helpful support through phone and email for questions, payment issues, and travel updates.",
  },
];

function AboutPage() {
  const navigate = useNavigate();

  return (
    <div
      className="info-page-wrapper"
      style={{ backgroundImage: `url(${cloudsBg})` }}
    >
      <nav className="info-navbar">
        <div className="info-nav-left">
          <Link to="/">Home</Link>
          <Link to="/about" className="active">
            About
          </Link>
          <Link to="/reviews">Reviews</Link>
        </div>
        <div className="info-nav-right">
          <a href="tel:+977984123456">+977 984 123 456</a>
          <a href="mailto:info@binayakjets.com">info@binayakjets.com</a>
        </div>
      </nav>

      <main className="info-page-content">
        <section className="info-intro">
          <p className="info-kicker">About Binayak Jets</p>
          <h1>From mountains to city lights, made easy.</h1>
          <p className="info-lead">
            Binayak Jets is focused on making domestic travel across Nepal
            easier, faster, and more dependable. We combine route visibility,
            clear fares, and a modern booking experience in one place.
          </p>
        </section>

        <section className="info-cards-grid">
          {ABOUT_HIGHLIGHTS.map((item) => (
            <article key={item.title} className="info-card">
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className="info-story">
          <h2>Why travelers choose us</h2>
          <p>
            We are designed for both first-time flyers and frequent travelers.
            From deal discovery to secure payment callback support, every part
            of the platform is built to keep your journey smooth and clear.
          </p>
        </section>
      </main>

      <div className="info-page-footer">
        <button className="info-cta-btn" onClick={() => navigate("/flights")}>
          Book the Flight
          <span className="info-cta-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

export default AboutPage;
