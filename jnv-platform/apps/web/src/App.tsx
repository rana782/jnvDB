import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./layout/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { SchoolsPage } from "./pages/SchoolsPage";
import { SchoolDetailPage } from "./pages/SchoolDetailPage";
import { RevenuePage } from "./pages/RevenuePage";
import { ProgressPage } from "./pages/ProgressPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ComparePage } from "./pages/ComparePage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/schools" element={<SchoolsPage />} />
        <Route path="/schools/:udise" element={<SchoolDetailPage />} />
        <Route path="/revenue" element={<RevenuePage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
