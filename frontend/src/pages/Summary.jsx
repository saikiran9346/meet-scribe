import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import MeetingChatbot from "../components/MeetingChatbot";
import { useApi } from "../hooks/useApi";
import { auth } from "../firebase";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";

const SENTIMENT_CHIP = { positive: "chip-positive", neutral: "chip-neutral", mixed: "chip-mixed", negative: "chip-negative" };

const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "decisions", label: "Decisions" },
  { id: "actions",   label: "Actions"   },
  { id: "speakers",  label: "Speakers"  },
  { id: "transcript",label: "Transcript"},
  { id: "chat",      label: "Chat AI"   },
];

export default function Summary() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const api = useApi();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [tab, setTab]         = useState("overview");
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    loadMeeting();
  }, [sessionId]);

  const loadMeeting = async () => {
    setLoading(true);
    setError("");
    try {
      console.log("Loading meeting:", sessionId);
      const result = await api.getMeeting(sessionId);
      console.log("Meeting loaded:", result);
      if (result && result.summary) {
        setData({ ...result, _saved: result._saved || false });
      } else {
        setError("Meeting data is incomplete");
      }
    } catch (err) {
      console.error("Failed to load meeting:", err);
      setError("Failed to load meeting. Please try again or go back to dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDashboard = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${BASE}/api/meetings/${sessionId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to save meeting");
      }

      console.log("Meeting saved:", result);
      setData(prev => ({ ...prev, _saved: true }));
      alert(`✓ "${result.title || 'Meeting'}" saved to dashboard!`);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save meeting: " + err.message);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="center-half center-loading">Loading summary...</div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <div className="page-content page-content--medium">
          <div className="glass empty-state--card">
            <div className="fs-icon">⚠️</div>
            <h2 className="fs-3xl text-error">Failed to Load Meeting</h2>
            <p className="text-sub">{error}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn-primary" onClick={loadMeeting}>Retry</button>
              <button className="btn-ghost" onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const { summary = {}, transcript = [], createdAt } = data || {};

  const handleShare = async () => {
    setSharing(true);
    try {
      const { url } = await api.getShareLink(sessionId);
      setShareUrl(url);
    } catch (err) {
      console.error("Share error:", err);
      alert("Failed to generate share link.");
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportText = () => {
    const textContent = (transcript || []).map(entry => `[${entry.speaker}] ${entry.text}`).join('\n\n') || 'No transcript available';
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-${sessionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePdf = async () => {
    try {
      const { url } = await api.getPdfLink(sessionId);
      if (url) {
        const fullUrl = url.startsWith("http") ? url : `${BASE}${url}`;
        const response = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
        });
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `meeting-${sessionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      } else {
        alert("PDF could not be generated. The meeting data may be incomplete.");
      }
    } catch (err) {
      console.error("PDF error:", err);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  return (
    <>
      <div className="glow-blob glow-blob-1" />
      <Navbar />

      <div className="page-content page-content--medium">

        {/* Header */}
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate("/dashboard")}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>

          <div className="page-title-row">
            <div>
              <h1 className="page-title">{summary.title || "Meeting Summary"}</h1>
              <div className="page-meta">
                <span className={`chip ${SENTIMENT_CHIP[summary.sentiment] || "chip-neutral"}`}>
                  {summary.sentiment || "neutral"}
                </span>
                {summary.sentimentReason && (
                  <span className="page-meta__reason">{summary.sentimentReason}</span>
                )}
                {createdAt && (
                  <span className="page-meta__date">{new Date(createdAt).toLocaleString()}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="actions-row">
              {!data._saved && (
                <button className="btn-primary btn-icon btn-save" onClick={handleSaveToDashboard}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Meeting
                </button>
              )}
              {data._saved && (
                <span className="btn-saved">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved to Dashboard
                </span>
              )}
              <button className="btn-ghost btn-icon" onClick={handlePdf}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H9a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>
              <button className="btn-ghost btn-icon" onClick={handleShare} disabled={sharing}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {sharing ? "Generating..." : "Share"}
              </button>
            </div>
          </div>

          {/* Share URL */}
          {shareUrl && (
            <div className="glass share-box">
              <input className="input share-box__input" value={shareUrl} readOnly />
              <button className="btn-primary share-box__copy" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="tab-bar tab-bar--page">
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="glass fade-in tab-content">
            <p className="overview-text">{summary.overview}</p>
            {summary.duration && (
              <p className="overview-duration">Estimated duration: {summary.duration}</p>
            )}
          </div>
        )}

        {/* ── Key Decisions ── */}
        {tab === "decisions" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Key decisions</h3>
            {(summary.keyDecisions || []).length === 0 ? (
              <p className="empty-state">No decisions were identified.</p>
            ) : (
              <div className="list-column">
                {summary.keyDecisions.map((d, i) => (
                  <div key={i} className="decision-item">
                    <div className="decision-item__icon">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="decision-item__text">{d}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Action Items ── */}
        {tab === "actions" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Action items</h3>
            {(summary.actionItems || []).length === 0 ? (
              <p className="empty-state">No action items were identified.</p>
            ) : (
              <div className="list-column">
                {summary.actionItems.map((item, i) => (
                  <div key={i} className="action-card">
                    <div className="action-card__content">
                      <p className="action-card__task">{item.task}</p>
                      <p className="action-card__owner">Owner: {item.owner}</p>
                    </div>
                    <span className={`priority-${item.priority || "medium"}`}>{item.priority || "medium"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Speaker Breakdown ── */}
        {tab === "speakers" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Speaker breakdown</h3>
            {(summary.speakerBreakdown || []).length === 0 ? (
              <p className="empty-state">No speaker data available.</p>
            ) : (
              <div className="list-column list-column--wide">
                {summary.speakerBreakdown.map((s, i) => (
                  <div key={i} className="speaker-item">
                    <div className="speaker-avatar speaker-item__avatar">
                      {s.speaker?.charAt(s.speaker.length - 1)}
                    </div>
                    <div>
                      <p className="speaker-item__name">{s.speaker}</p>
                      <p className="speaker-item__summary">{s.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Full Transcript ── */}
        {tab === "transcript" && (
          <div className="glass fade-in tab-content">
            <div className="transcript-tab__header">
              <h3 className="transcript-tab__heading">Full transcript</h3>
              <button className="btn-ghost btn-icon--small" onClick={handleExportText}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
            </div>
            <div className="transcript-tab__scroll">
              {transcript.map((entry) => (
                <div key={entry.id} className="transcript-entry">
                  <div className="speaker-avatar">{entry.speaker?.charAt(entry.speaker.length - 1)}</div>
                  <div>
                    <div className="transcript-meta">{entry.speaker} · {new Date(entry.timestamp).toLocaleTimeString()}</div>
                    <div className="transcript-text">{entry.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Chat AI ── */}
        {tab === "chat" && (
          <div className="glass fade-in tab-content">
            <div className="chat-tab">
              <h3 className="chat-tab__title">Chat about this meeting</h3>
              <p className="chat-tab__subtitle">
                Powered by LangChain + Gemini — remembers your entire conversation history
              </p>
            </div>
            <MeetingChatbot sessionId={sessionId} />
          </div>
        )}

      </div>
    </>
  );
}
