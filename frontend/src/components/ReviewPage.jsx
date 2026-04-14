import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { reviews as reviewsApi } from "../api";
import { useAuth } from "../AuthContext";
import cloudsBg from "../assets/clouds-bg.png";
import "./InfoPages.css";

function ReviewPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    route: "",
    rating: "5",
    text: "",
  });
  const [formError, setFormError] = useState("");
  const [listError, setListError] = useState("");
  const hasMoreReviews = reviews.length > 3;
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    let mounted = true;

    const loadReviews = async () => {
      try {
        const data = await reviewsApi.list();
        if (!mounted) return;
        setReviews(Array.isArray(data) ? data : []);
        setListError("");
      } catch (error) {
        if (!mounted) return;
        setListError(
          error?.message || "Failed to load reviews. Please refresh the page.",
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadReviews();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!user) {
      setFormError("Sign in to share your travel experience with other customers.");
      return;
    }

    const name = formData.name.trim();
    const route = formData.route.trim();
    const text = formData.text.trim();
    const rating = Number(formData.rating);

    if (!name || !route || !text) {
      setFormError("Please fill in all fields before posting your review.");
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setFormError("Rating must be between 1 and 5.");
      return;
    }

    try {
      const created = await reviewsApi.create({ name, route, text, rating });
      setReviews((prev) => [created, ...prev]);
      setFormData({ name: "", route: "", rating: "5", text: "" });
      setFormError("");
      setListError("");
    } catch (error) {
      setFormError(error?.message || "Could not post review. Please try again.");
    }
  };

  return (
    <div
      className="info-page-wrapper"
      style={{ backgroundImage: `url(${cloudsBg})` }}
    >
      <nav className="info-navbar">
        <div className="info-nav-left">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/reviews" className="active">
            Reviews
          </Link>
        </div>
        <div className="info-nav-right">
          <a href="tel:+977984123456">+977 984 123 456</a>
          <a href="mailto:info@binayakjets.com">info@binayakjets.com</a>
        </div>
      </nav>

      <main className="info-page-content">
        <section className="info-intro">
          <p className="info-kicker">Traveler Reviews</p>
          <h1>What people say about Binayak Jets.</h1>
          <p className="info-lead">
            Real feedback from travelers using our domestic flight booking
            experience across Nepal.
          </p>
        </section>

        <section className="info-cards-grid">
          {visibleReviews.map((review) => (
            <article key={review.id} className="info-card">
              <h2>{review.name}</h2>
              <p className="info-review-route">{review.route}</p>
              <p className="info-review-rating">
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </p>
              <p>{review.text}</p>
            </article>
          ))}
        </section>

        {hasMoreReviews ? (
          <div className="info-reviews-toggle-wrap">
            <button
              type="button"
              className="info-form-submit info-reviews-toggle-btn"
              onClick={() => setShowAllReviews((prev) => !prev)}
            >
              {showAllReviews ? "Show only recent 3" : "See all reviews"}
            </button>
          </div>
        ) : null}

        {isLoading ? <p className="info-form-error">Loading reviews...</p> : null}
        {!isLoading && listError ? (
          <p className="info-form-error">{listError}</p>
        ) : null}
        {!isLoading && !listError && reviews.length === 0 ? (
          <p className="info-form-error">
            No reviews yet. Be the first customer to post one.
          </p>
        ) : null}

        <section className="info-review-form-wrap">
          <h2 className="info-form-title">Write a review</h2>
          <p className="info-form-subtitle">
            Tell other travelers about your booking and flight experience.
          </p>
          <form className="info-review-form" onSubmit={handleSubmit}>
            <div className="info-form-grid">
              <label className="info-form-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. Elon Musk"
                  maxLength={60}
                  disabled={!user}
                />
              </label>

              <label className="info-form-field">
                <span>Route</span>
                <input
                  type="text"
                  value={formData.route}
                  onChange={(e) => updateField("route", e.target.value)}
                  placeholder="e.g. Kathmandu to Pokhara"
                  maxLength={80}
                  disabled={!user}
                />
              </label>

              <label className="info-form-field info-form-field-rating">
                <span>Rating</span>
                <select
                  value={formData.rating}
                  onChange={(e) => updateField("rating", e.target.value)}
                  disabled={!user}
                >
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Very good</option>
                  <option value="3">3 - Good</option>
                  <option value="2">2 - Fair</option>
                  <option value="1">1 - Poor</option>
                </select>
              </label>
            </div>

            <label className="info-form-field info-form-field-textarea">
              <span>Your review</span>
              <textarea
                value={formData.text}
                onChange={(e) => updateField("text", e.target.value)}
                placeholder="Share your experience..."
                rows={4}
                maxLength={400}
                disabled={!user}
              />
            </label>

            {formError ? <p className="info-form-error">{formError}</p> : null}

            <div className="info-form-actions">
              {!loading && !user ? (
                <p className="info-form-note info-form-note-inline">
                  Want to share your journey? <Link to="/auth">Sign in</Link> to
                  post a review.
                </p>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="info-form-submit"
                disabled={!user}
              >
                Post review
              </button>
            </div>
          </form>
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

export default ReviewPage;
