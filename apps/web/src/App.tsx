import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import SignIn from './pages/SignIn';
import TicketsList from './pages/TicketsList';
import NewTicket from './pages/NewTicket';
import TicketDetail from './pages/TicketDetail';
import StatusPage from './pages/StatusPage';
import Queue from './pages/Queue';
import AdminUsers from './pages/AdminUsers';
import AdminCategories from './pages/AdminCategories';
import AdminLocations from './pages/AdminLocations';
import AdminNotifications from './pages/AdminNotifications';

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<TicketsList />} />
          <Route path="/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/locations" element={<AdminLocations />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/status" element={<StatusPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
