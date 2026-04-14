import { useState, useEffect, useRef } from "react";
import { useApi } from "../hooks/useApi";

export default function MeetingChatbot({ sessionId }) {
  const api = useApi();
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [initializing, setInit]   = useState(true);
  const bottomRef                 = useRef(null);

  useEffect(() => {
    api.getChatHistory(sessionId)
      .then((data) => setMessages(data.messages || []))
      .catch(() => {})
      .finally(() => setInit(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await api.sendChat(sessionId, text);
      setMessages(res.messages);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (initializing) {
    return <div className="center-small center-loading--small">Loading chat...</div>;
  }

  return (
    <div className="chat-window">
      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty__icon">💬</div>
            <p className="chat-empty__text">Ask anything about this meeting</p>
            <p className="chat-empty__hint">
              Who said what, decisions made, action items...
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role} fade-in`}>
            {msg.role === "assistant" && (
              <div className="chat-bubble__label">AI Scribe</div>
            )}
            <div className="chat-bubble__content">{msg.content}</div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="chat-bubble assistant fade-in">
            <div className="chat-bubble__typing-label">AI Scribe</div>
            <div className="chat-bubble__typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          className="input chat-input-row__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this meeting..."
          disabled={loading}
        />
        <button
          className="btn-primary chat-input-row__send"
          onClick={send}
          disabled={loading || !input.trim()}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
