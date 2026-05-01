import { useAuth } from "../context/AuthContext";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8080";

export function useApi() {
  const { getToken } = useAuth();

  const req = async (method, path, body = null) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  };

  return {
    startBot:         (meetUrl)            => req("POST", "/bot/start", { meetUrl }),
    stopBot:          (sessionId)          => req("POST", "/bot/stop", { sessionId }),
    getLiveTranscript:(sessionId)          => req("GET",  `/bot/transcript/${sessionId}`),
    getMeetings:      ()                   => req("GET",  "/meetings"),
    getMeeting:       (sessionId)          => req("GET",  `/meetings/${sessionId}`),
    deleteMeeting:    (sessionId)          => req("DELETE",`/meetings/${sessionId}`),
    sendChat:         (sessionId, message) => req("POST", `/meetings/${sessionId}/chat`, { message }),
    getChatHistory:   (sessionId)          => req("GET",  `/meetings/${sessionId}/chat`),
    getShareLink:     (sessionId)          => req("POST", `/meetings/${sessionId}/share`),
    getPdfLink:       (sessionId)          => req("GET",  `/meetings/${sessionId}/pdf`),
  };
}