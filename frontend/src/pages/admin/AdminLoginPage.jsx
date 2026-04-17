import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import cloudsBg from "../../assets/clouds-bg.png";
import "../../components/AuthPage.css";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/admin";
  const { adminLogin } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminLogin(form.email, form.password);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <div className="auth-card">
        <h1 className="auth-logo" onClick={() => navigate("/admin")}>
          Admin Portal
        </h1>
        <p className="auth-subtitle">Sign in as admin</p>
        {error ? <div className="auth-error">{error}</div> : null}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Please wait..." : "Admin Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
