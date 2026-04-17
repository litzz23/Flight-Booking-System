import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import cloudsBg from "../../assets/clouds-bg.png";
import "../FlightDeals.css";
import "./AdminDashboard.css";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout() {
  const navigate = useNavigate();
  const { adminUser, adminLogout } = useAuth();

  return (
    <div className="fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <header className="fd-header">
        <div className="fd-header-left">
          <span className="fd-logo" onClick={() => navigate("/admin")}>
            Binayak Airlines
          </span>
        </div>
        <div className="fd-header-actions">
          <button
            type="button"
            className="fd-nav-btn"
            onClick={() => navigate("/admin")}
          >
            Admin Dashboard
          </button>
          <div className="fd-user-avatar" title={adminUser?.name}>
            {adminUser?.name?.charAt(0)?.toUpperCase()}
          </div>
          <button
            type="button"
            className="fd-nav-btn fd-logout"
            onClick={adminLogout}
          >
            Logout
          </button>
        </div>
      </header>
      <main className="ad-layout">
        <AdminSidebar />
        <section className="ad-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
