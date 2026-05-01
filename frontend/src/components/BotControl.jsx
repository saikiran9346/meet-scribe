import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";

export default function BotControl() {
  const api = useApi();
  const navigate = useNavigate();

  const [meetUrl, setMeetUrl] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");

  const handleStart = async () => {
    if (!meetUrl.trim()) return;
    setError("");
    setBusy(true);
    try {
      const { sessionId } = await api.startBot(meetUrl);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass bot-control">
      <div className="bot-control__header">
        <h2 className="bot-control__title">Start a new session</h2>
        <p className="bot-control__subtitle">
          Paste a Google Meet link — the AI bot will join and start transcribing
        </p>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="bot-control__input-row">
        <input
          className="input bot-control__input"
          value={meetUrl}
          onChange={(e) => setMeetUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          placeholder="https://meet.google.com/abc-defg-hij"
          disabled={busy}
        />
        <button
          className="btn-primary bot-control__deploy"
          onClick={handleStart}
          disabled={busy || !meetUrl.trim()}
        >
          {busy ? (
            <span className="spinner--btn">
              <span className="spinner spinner--sm" />
              Starting...
            </span>
          ) : (
            <span className="spinner--btn">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Deploy Bot
            </span>
          )}
        </button>
      </div>

      {/* Tips */}
      <div className="bot-control__tips">
        {[
          { icon: "🤖", text: "Bot joins silently as AI Scribe" },
          { icon: "🎙️", text: "Real-time transcription starts automatically" },
          { icon: "✨", text: "Stop anytime to generate AI summary" },
        ].map((tip) => (
          <div key={tip.text} className="bot-control__tip">
            <span>{tip.icon}</span>
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
