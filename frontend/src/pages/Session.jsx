import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Navbar from "../components/Navbar";
import LiveTranscript from "../components/LiveTranscript";
import { auth } from "../firebase";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";

const STATUS_MAP = {
  launching:   { label: "Launching browser",    cls: "status-loading" },
  navigating:  { label: "Opening Meet link",     cls: "status-loading" },
  joining:     { label: "Joining meeting",       cls: "status-loading" },
  joined:      { label: "Bot joined",            cls: "status-active"  },
  listening:   { label: "Live · Listening",      cls: "status-active"  },
  summarizing: { label: "Generating summary...", cls: "status-loading" },
  stopped:     { label: "Session ended",         cls: "status-idle"    },
  error:       { label: "Error occurred",        cls: "status-error"   },
};

export default function Session() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  const [status, setStatus]         = useState("launching");
  const [statusMsg, setStatusMsg]   = useState("Starting up...");
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim]       = useState("");
  const [stopping, setStopping]     = useState(false);
  const [error, setError]           = useState("");

  const socketRef = useRef(null);

  const isLive = status === "listening" || status === "joined";
  const cfg    = STATUS_MAP[status] || STATUS_MAP.launching;

  useEffect(() => {
    const socket = io(BASE, {
    transports: ["websocket"],   // ✅ FIX
    withCredentials: false,
  });
    socketRef.current = socket;
    socket.emit("join-session", sessionId);

    socket.on("bot-status", ({ status: s, message }) => {
      setStatus(s);
      setStatusMsg(message || "");
    });

    socket.on("transcript-update", ({ entry, text, isFinal }) => {
      if (isFinal && entry) {
        setTranscript((prev) => [...prev, entry]);
        setInterim("");
      } else if (!isFinal && text) {
        setInterim(text);
      }
    });

    socket.on("summary-ready", ({ sessionId: sid }) => {
      const targetSessionId = sid || sessionId;
      console.log("Summary ready event received for:", targetSessionId);
      setTimeout(() => {
        navigate(`/summary/${targetSessionId}`, { replace: true });
      }, 1500);
    });
    socket.on("bot-error", ({ message }) => {
      setStatus("error");
      setError(message);
    });

    return () => socket.disconnect();
  }, [sessionId]);

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    setError("");
    setStatus("summarizing");
    setStatusMsg("Generating AI summary...");

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${BASE}/api/bot/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to stop bot");
      }

      setStatusMsg("Summary generated! Loading...");
    } catch (err) {
      console.error("Stop error:", err);
      setError(err.message);
      setStopping(false);
      setStatus("error");
    }
  };

  const canStop = isLive && !stopping;

  return (
    <>
      <div className="glow-blob glow-blob-1" />
      <Navbar />

      <div className="page-content page-content--narrow">

        {/* Page header */}
        <div className="session-header">
          <div>
            <h1 className="page-title--session">Live session</h1>

            <div className={`status-badge ${cfg.cls}`}>
              <span className={`status-dot ${isLive ? "dot-pulse" : ""} session-status__dot session-status__dot--${
                isLive ? "live" : status === "error" ? "error" : status === "summarizing" ? "summarizing" : "idle"
              }`} />
              {cfg.label}
            </div>

            {statusMsg && <p className="session-status__msg">{statusMsg}</p>}
          </div>

          {/* Stop button */}
          {status !== "stopped" && status !== "summarizing" && (
            <button className="btn-danger" onClick={handleStop} disabled={!canStop}>
              {stopping ? "Processing..." : "Stop & Summarize"}
            </button>
          )}

          {status === "summarizing" && (
            <div className="session-summarizing">
              <span className="spinner spinner--md" />
              Generating AI summary...
            </div>
          )}
        </div>

        {error && <div className="error-box session-error">{error}</div>}

        {/* Live transcript component */}
        <LiveTranscript transcript={transcript} interim={interim} isLive={isLive} />
      </div>
    </>
  );
}
