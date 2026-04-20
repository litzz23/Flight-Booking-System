import { Link, useNavigate } from "react-router-dom";
import airplaneWindow from "../assets/airplane-window.png";
import "./HeroPage.css";

function HeroPage() {
  const navigate = useNavigate();

  return (
    <div
      className="hero-wrapper"
      style={{ backgroundImage: `url(${airplaneWindow})` }}
    >
      <nav className="navbar">
        <div className="nav-left">
          <Link to="/about">About</Link>
          <Link to="/reviews">Reviews</Link>
        </div>
        <div className="nav-right">
          <a href="tel:+977984123456">+977 984 123 456</a>
          <a href="mailto:info@binayakjets.com">info@binayakjets.com</a>
        </div>
      </nav>

      <span className="hero-brand-overlay">Binayak Jets</span>

      <main className="hero-main">
        <div className="hero-left">
          <h1 className="hero-movement">
            From Peaks
            <br />
            To Planes
          </h1>
          <div className="hero-tagline">
            <p className="hero-tagline-title">
              From
              <br />
              mountains to
              <br />
              city lights
            </p>
            <p className="hero-tagline-body">
              Fly across Nepal with comfort and confidence,
              <br />
              with routes, fares, and schedules designed
              <br />
              for travelers in Nepal and everyone exploring
              <br />
              this beautiful country.
            </p>
          </div>
        </div>

        <div className="hero-center" aria-hidden="true" />

        <div className="hero-right">
          <h2 className="hero-distinction">
            Conquer
            <br />
            Nepal's
            <br />
            Skies
          </h2>
          <div className="hero-scroll-hint">
            <div className="scroll-line">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span>BOOK FLIGHTS NOW</span>
            </div>
            <span className="scroll-separator">TO START THE JOURNEY</span>
          </div>
        </div>
      </main>

      <div className="hero-book-cta">
        <button className="btn-book" onClick={() => navigate("/flights")}>
          Book the Flight
          <span className="btn-icon">
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

export default HeroPage;
