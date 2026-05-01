import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => navigate("/dashboard")}>
        <div className="navbar-logo-icon">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        MeetScribe
      </div>

      <div className="navbar-user-area">
        {user && (
          <>
            <span className="navbar-email">{user.email}</span>
            <button className="btn-ghost navbar-logout" onClick={handleLogout}>
              Sign out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
