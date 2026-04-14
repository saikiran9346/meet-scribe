import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";
const SENTIMENT_CHIP = { positive: "chip-positive", neutral: "chip-neutral", mixed: "chip-mixed", negative: "chip-negative" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "decisions", label: "Decisions" },
  { id: "actions", label: "Actions" },
  { id: "speakers", label: "Speakers" },
  { id: "transcript", label: "Transcript" },
];

export default function Share() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => { loadMeeting(); }, [sessionId]);

  const loadMeeting = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/share/${sessionId}`);
      if (!res.ok) throw new Error("Meeting not found");
      setData(await res.json());
    } catch { setError("This meeting is not available or has been removed."); }
    finally { setLoading(false); }
  };

  if (loading) return <><Navbar /><div className="center-half center-loading">Loading shared meeting...</div></>;

  if (error) return (
    <>
      <Navbar />
      <div className="page-content page-content--medium">
        <div className="glass empty-state--card">
          <div className="fs-icon">⚠️</div>
          <h2 className="fs-3xl text-error">Meeting Not Available</h2>
          <p className="text-sub">{error}</p>
          <button className="btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    </>
  );

  const { summary = {}, transcript = [], createdAt } = data || {};

  return (
    <>
      <div className="glow-blob glow-blob-1" />
      <Navbar />
      <div className="page-content page-content--medium">
        <div className="page-header">
          <button className="btn-back" onClick={() => navigate("/")}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </button>
          <div className="page-title-row">
            <div>
              <h1 className="page-title">{summary.title || "Meeting Summary"}</h1>
              <div className="page-meta">
                <span className={`chip ${SENTIMENT_CHIP[summary.sentiment] || "chip-neutral"}`}>
                  {summary.sentiment || "neutral"}
                </span>
                {summary.sentimentReason && <span className="page-meta__reason">{summary.sentimentReason}</span>}
                {createdAt && <span className="page-meta__date">{new Date(createdAt).toLocaleString()}</span>}
              </div>
            </div>
            <span className="btn-share-label">Shared view (read-only)</span>
          </div>
        </div>

        <div className="tab-bar tab-bar--page">
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="glass fade-in tab-content">
            <p className="overview-text">{summary.overview}</p>
            {summary.duration && <p className="overview-duration">Estimated duration: {summary.duration}</p>}
          </div>
        )}

        {tab === "decisions" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Key decisions</h3>
            {(summary.keyDecisions || []).length === 0
              ? <p className="empty-state">No decisions were identified.</p>
              : <div className="list-column">{summary.keyDecisions.map((d, i) => (
                  <div key={i} className="decision-item">
                    <div className="decision-item__icon">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="decision-item__text">{d}</p>
                  </div>
                ))}</div>
            }
          </div>
        )}

        {tab === "actions" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Action items</h3>
            {(summary.actionItems || []).length === 0
              ? <p className="empty-state">No action items were identified.</p>
              : <div className="list-column">{summary.actionItems.map((item, i) => (
                  <div key={i} className="action-card">
                    <div className="action-card__content">
                      <p className="action-card__task">{item.task}</p>
                      <p className="action-card__owner">Owner: {item.owner}</p>
                    </div>
                    <span className={`priority-${item.priority || "medium"}`}>{item.priority || "medium"}</span>
                  </div>
                ))}</div>
            }
          </div>
        )}

        {tab === "speakers" && (
          <div className="glass fade-in tab-content">
            <h3 className="section-heading">Speaker breakdown</h3>
            {(summary.speakerBreakdown || []).length === 0
              ? <p className="empty-state">No speaker data available.</p>
              : <div className="list-column list-column--wide">{summary.speakerBreakdown.map((s, i) => (
                  <div key={i} className="speaker-item">
                    <div className="speaker-avatar speaker-item__avatar">{s.speaker?.charAt(s.speaker.length - 1)}</div>
                    <div>
                      <p className="speaker-item__name">{s.speaker}</p>
                      <p className="speaker-item__summary">{s.summary}</p>
                    </div>
                  </div>
                ))}</div>
            }
          </div>
        )}

        {tab === "transcript" && (
          <div className="glass fade-in tab-content">
            <div className="transcript-tab__header">
              <h3 className="transcript-tab__heading">Full transcript</h3>
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
      </div>
    </>
  );
}
