import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import HeroPage from './components/HeroPage'
import FlightDeals from './components/FlightDeals'
import FlightSearchPage from './components/FlightSearchPage'
import BookFlightPage from './components/BookFlightPage'
import AuthPage from './components/AuthPage'
import MyBookings from './components/MyBookings'
import WalletPage from './components/WalletPage'
import PaymentCallbackPage from './components/PaymentCallbackPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HeroPage />} />
          <Route path="/flights/search" element={<FlightSearchPage />} />
          <Route path="/flights" element={<FlightDeals />} />
          <Route path="/flights/book/:flightId" element={<BookFlightPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/payment/callback" element={<PaymentCallbackPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
