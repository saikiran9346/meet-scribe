import { useEffect, useRef } from "react";

const SPEAKER_COLORS = [
  { bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.25)", text: "#a78bfa" },
  { bg: "rgba(14,165,233,0.15)", border: "rgba(14,165,233,0.25)", text: "#38bdf8" },
  { bg: "rgba(234,179,8,0.15)",  border: "rgba(234,179,8,0.25)",  text: "#facc15" },
  { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.25)",  text: "#4ade80" },
  { bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.25)",  text: "#f87171" },
];

export default function LiveTranscript({ transcript, interim, isLive }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, interim]);

  const speakerColorMap = {};
  let colorIndex = 0;
  const getColor = (speaker) => {
    if (!speakerColorMap[speaker]) {
      speakerColorMap[speaker] = SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length];
      colorIndex++;
    }
    return speakerColorMap[speaker];
  };

  return (
    <div className="glass transcript-panel">
      {/* Header */}
      <div className="transcript-panel__header">
        <h2 className="transcript-panel__title">Live transcript</h2>
        <div className="transcript-panel__info">
          {isLive && (
            <span className="transcript-panel__live">
              <span className="transcript-panel__dot">
                <span className="transcript-panel__dot-circle" />
                <span className="live-ring transcript-panel__dot-ring" />
              </span>
              Live
            </span>
          )}
          <span className="transcript-panel__count">
            {transcript.length} {transcript.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div className="transcript-panel__entries">
        {transcript.length === 0 && !interim && (
          <div className="transcript-panel__empty">
            <div className="transcript-panel__empty-icon">🎙️</div>
            <p className="transcript-panel__empty-text">
              Transcript will appear as people speak
            </p>
            <p className="transcript-panel__empty-hint">
              Make sure participants have their microphones unmuted
            </p>
          </div>
        )}

        {transcript.map((entry) => {
          const color = getColor(entry.speaker);
          const colorIdx = SPEAKER_COLORS.indexOf(color) + 1;
          return (
            <div key={entry.id} className="transcript-entry fade-in">
              <div className={`speaker-avatar speaker-color-${colorIdx}`}>
                {entry.speaker?.charAt(entry.speaker.length - 1)}
              </div>
              <div className="transcript-entry__content">
                <div className="transcript-entry__time">
                  <span className={`speaker-name-${colorIdx}`}>{entry.speaker}</span>
                  {" · "}
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                  })}
                </div>
                <div className="transcript-entry__text">{entry.text}</div>
              </div>
            </div>
          );
        })}

        {/* Interim (in-progress) text */}
        {interim && (
          <div className="transcript-entry transcript-entry--interim">
            <div className="speaker-avatar">…</div>
            <div className="transcript-entry__content">
              <div className="transcript-entry__text">{interim}</div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
