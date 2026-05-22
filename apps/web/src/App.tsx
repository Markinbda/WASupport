import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import SignIn from './pages/SignIn';
import AuthCallback from './pages/AuthCallback';
import TicketsList from './pages/TicketsList';
import NewTicket from './pages/NewTicket';
import TicketDetail from './pages/TicketDetail';
import StatusPage from './pages/StatusPage';
import Queue from './pages/Queue';
import AdminUsers from './pages/AdminUsers';
import UserProfile from './pages/UserProfile';
import AdminCategories from './pages/AdminCategories';
import AdminLocations from './pages/AdminLocations';
import AdminNotifications from './pages/AdminNotifications';
import KbList from './pages/KbList';
import KbArticleView from './pages/KbArticleView';
import KbEdit from './pages/KbEdit';

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<TicketsList />} />
          <Route path="/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id" element={<UserProfile />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/admin/categories" element={<AdminCategories />} />
          <Route path="/admin/locations" element={<AdminLocations />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/kb" element={<KbList />} />
          <Route path="/kb/new" element={<KbEdit />} />
          <Route path="/kb/:slug" element={<KbArticleView />} />
          <Route path="/kb/:slug/edit" element={<KbEdit />} />
          <Route path="/status" element={<StatusPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
