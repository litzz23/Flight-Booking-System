import { Outlet } from 'react-router-dom'
import FlightsHeader from '../../components/flights/FlightsHeader'
import DashboardSidebar from '../../components/dashboard/DashboardSidebar'
import cloudsBg from '../../assets/clouds-bg.png'
import '../../components/FlightDeals.css'
import '../../components/UserDashboard.css'

export default function DashboardLayout() {
  return (
    <div className="ud-page fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader />
      <main className="ud-layout">
        <DashboardSidebar />
        <section className="ud-content">
          <Outlet />
        </section>
      </main>
    </div>
  )
}
