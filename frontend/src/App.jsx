import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Session from "./pages/Session";
import Summary from "./pages/Summary";
import Share from "./pages/Share";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="center-full">
      <div className="spinner spinner--lg" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"            element={<Public><Login /></Public>} />
          <Route path="/dashboard"        element={<Protected><Dashboard /></Protected>} />
          <Route path="/session/:sessionId" element={<Protected><Session /></Protected>} />
          <Route path="/summary/:sessionId" element={<Protected><Summary /></Protected>} />
          <Route path="/share/:sessionId"  element={<Share />} />
          <Route path="*"                 element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
