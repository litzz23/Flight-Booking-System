import { useNavigate } from "react-router-dom";
import airplaneWindow from "../assets/airplane-window.png";
import "./HeroPage.css";

function HeroPage() {
  const navigate = useNavigate();

  return (
    <div
      className="hero-wrapper"
      style={{ backgroundImage: `url(${airplaneWindow})` }}
    >
      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-left">
          <a href="#">About</a>
          <a href="#">Our Fleet</a>
          <a href="#">Advantages</a>
          <a href="#">Global</a>
        </div>
        <div className="nav-right">
          <a href="tel:+977984123456">+977 984 123 456</a>
          <a href="mailto:info@binayakjets.com">info@binayakjets.com</a>
        </div>
      </nav>

      {/* Brand name — centered in the window */}
      <span className="hero-brand-overlay">Binayak Jets</span>

      {/* Hero Content — three columns */}
      <main className="hero-main">
        {/* Left */}
        <div className="hero-left">
          <h1 className="hero-movement">
            We are
            <br />
            movement
          </h1>
          <div className="hero-tagline">
            <p className="hero-tagline-title">
              Your
              <br />
              freedom to
              <br />
              enjoy life
            </p>
            <p className="hero-tagline-body">
              Every flight is designed around your comfort,
              <br />
              time, and ambitions — so you can focus on
              <br />
              what truly matters, while we take care of
              <br />
              everything else.
            </p>
          </div>
        </div>

        {/* Center — empty, keeps grid balanced */}
        <div className="hero-center" aria-hidden="true" />

        {/* Right */}
        <div className="hero-right">
          <h2 className="hero-distinction">
            We are
            <br />
            distinction
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
              <span>SCROLL DOWN</span>
            </div>
            <span className="scroll-separator">TO START THE JOURNEY</span>
          </div>
        </div>
      </main>

      {/* Book the Flight — bottom center */}
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
