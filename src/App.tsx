import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { SettingsProvider } from "./context/SettingsContext";
import { RectoSessionProvider } from "./context/RectoSessionContext";
import Home from "./pages/Home";
import RectoPage from "./pages/RectoPage";
import VersoPage from "./pages/VersoPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import AuthCallback from "./pages/AuthCallback";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: "2.5px solid var(--border-2)", borderTopColor: "var(--accent)",
        animation: "spin 0.75s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/recto" element={<Protected><RectoPage /></Protected>} />
      <Route path="/verso" element={<Protected><VersoPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <RectoSessionProvider>
            <div className="app-root">
              <main className="app-main">
                <AppRoutes />
              </main>
            </div>
          </RectoSessionProvider>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
