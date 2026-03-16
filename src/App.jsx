import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DepartmentsPage from './pages/DepartmentsPage';
import GradesPage from './pages/GradesPage';
import SkillsPage from './pages/SkillsPage';
import ShiftsPage from './pages/ShiftsPage';
import StaffPage from './pages/StaffPage';
import ShiftRequestsPage from './pages/ShiftRequestsPage';
import LeavesPage from './pages/LeavesPage';
import DemandPage from './pages/DemandPage';
import HardConstraintsPage from './pages/HardConstraintsPage';
import SoftConstraintsPage from './pages/SoftConstraintsPage';
import RosterPage from './pages/RosterPage';
import ThemeSettingsPage from './pages/ThemeSettingsPage';
import AuditLogPage from './pages/AuditLogPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AppShell() {
  return (
    <ThemeProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/grades" element={<GradesPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/shift-requests" element={<ShiftRequestsPage />} />
            <Route path="/leaves" element={<LeavesPage />} />
            <Route path="/demand" element={<DemandPage />} />
            <Route path="/hard-constraints" element={<HardConstraintsPage />} />
            <Route path="/soft-constraints" element={<SoftConstraintsPage />} />
            <Route path="/roster" element={<RosterPage />} />
            <Route path="/themes" element={<ThemeSettingsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Routes>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
      } />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
