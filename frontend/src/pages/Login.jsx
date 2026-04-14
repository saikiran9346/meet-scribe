import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [mode, setMode]     = useState("login");
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState("");
  const [error, setError]   = useState("");
  const [busy, setBusy]     = useState(false);
  const { loginGoogle, loginEmail, signupEmail } = useAuth();
  const navigate = useNavigate();

  const go = () => navigate("/dashboard");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      mode === "signup" ? await signupEmail(email, pass) : await loginEmail(email, pass);
      go();
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/\(auth.*?\)\.?/, "").trim());
    } finally { setBusy(false); }
  };

  const handleGoogle = async () => {
    setError(""); setBusy(true);
    try { await loginGoogle(); go(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="center-full" style={{ padding: 16 }}>
      <div className="glow-blob glow-blob-1" />
      <div className="glow-blob glow-blob-2" />

      <div className="page-content page-content--login">
        {/* Logo */}
        <div className="login-logo-section">
          <div className="login-logo-row">
            <div className="navbar-logo-icon login-logo-icon">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="login-title">MeetScribe</h1>
          </div>
          <p className="login-subtitle">AI-powered meeting intelligence</p>
        </div>

        <div className="glass login-card">
          {/* Tabs */}
          <div className="tab-bar login-tab-bar">
            <button className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Sign in</button>
            <button className={`tab-btn ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>Sign up</button>
          </div>

          {error && <div className="error-box login-error">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <div>
              <label className="login-label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div>
              <label className="login-label">Password</label>
              <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" required />
            </div>
            <button className="btn-primary login-submit" type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="login-divider-row">
            <div className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <div className="login-divider-line" />
          </div>

          <button className="btn-ghost login-google" onClick={handleGoogle} disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
