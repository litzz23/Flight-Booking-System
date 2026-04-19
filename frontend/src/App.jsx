import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import HeroPage from "./components/HeroPage";
import FlightDeals from "./components/FlightDeals";
import FlightSearchPage from "./components/FlightSearchPage";
import BookFlightPage from "./components/BookFlightPage";
import AuthPage from "./components/AuthPage";
import MyBookings from "./components/MyBookings";
import WalletPage from "./components/WalletPage";
import PaymentCallbackPage from "./components/PaymentCallbackPage";
import AboutPage from "./components/AboutPage";
import ReviewPage from "./components/ReviewPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import DashboardOverviewPage from "./pages/dashboard/DashboardOverviewPage";
import DashboardBookingsPage from "./pages/dashboard/DashboardBookingsPage";
import DashboardWalletPage from "./pages/dashboard/DashboardWalletPage";
import DashboardProfilePage from "./pages/dashboard/DashboardProfilePage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminDestinationsPage from "./pages/admin/AdminDestinationsPage";
import AdminFlightsPage from "./pages/admin/AdminFlightsPage";
import AdminBookingsPage from "./pages/admin/AdminBookingsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminAlertsPage from "./pages/admin/AdminAlertsPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HeroPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/reviews" element={<ReviewPage />} />
          <Route path="/flights/search" element={<FlightSearchPage />} />
          <Route path="/flights" element={<FlightDeals />} />
          <Route
            path="/flights/book/:flightId"
            element={
              <ProtectedRoute>
                <BookFlightPage />
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardOverviewPage />} />
            <Route path="bookings" element={<DashboardBookingsPage />} />
            <Route path="wallet" element={<DashboardWalletPage />} />
            <Route path="profile" element={<DashboardProfilePage />} />
          </Route>
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <MyBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <WalletPage />
              </ProtectedRoute>
            }
          />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin/register"
            element={<Navigate to="/admin/login" replace />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin redirectTo="/admin/login">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="destinations" element={<AdminDestinationsPage />} />
            <Route path="flights" element={<AdminFlightsPage />} />
            <Route path="alerts" element={<AdminAlertsPage />} />
            <Route path="bookings" element={<AdminBookingsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
