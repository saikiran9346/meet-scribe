const { ChatGroq } = require("@langchain/groq");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");

const model = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  maxTokens: 2048,
});

const chatSessions = new Map();

function formatTranscript(entries) {
  return entries.map((e) => `[${e.speaker}]: ${e.text}`).join("\n");
}

async function summarizeTranscript(transcriptEntries) {
  const text = formatTranscript(transcriptEntries);
  if (!text.trim()) throw new Error("Transcript is empty");

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are an expert meeting assistant. Analyze this meeting transcript carefully.
Respond with ONLY valid JSON (no markdown, no backticks, no explanation).`],
    ["human", `Transcript:
${text}

Respond with ONLY valid JSON (no markdown, no backticks, no explanation):
{{
  "title": "Short meeting title 5-7 words",
  "overview": "In few sentence summary of the entire meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    {{ "task": "task description", "owner": "person name or Team", "priority": "high or medium or low" }}
  ],
  "speakerBreakdown": [
    {{ "speaker": "Speaker 1", "summary": "What this person mainly discussed" }}
  ],
  "sentiment": "positive or neutral or mixed or negative",
  "sentimentReason": "One sentence explaining the sentiment",
  "duration": "Estimated meeting length"
}}`]
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const response = await chain.invoke({});
  const raw = response.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(raw);
  } catch {
    console.error("Failed to parse summary JSON:", raw);
    return {
      title: "Meeting Summary",
      overview: "Summary generation failed",
      keyDecisions: [],
      actionItems: [],
      speakerBreakdown: [],
      sentiment: "neutral",
      sentimentReason: "Could not determine sentiment",
      duration: "unknown",
    };
  }
}

function initChatSession(sessionId, transcriptEntries, summaryData) {
  const transcript = formatTranscript(transcriptEntries);
  const summaryText = summaryData
    ? `Meeting title: ${summaryData.title}\nOverview: ${summaryData.overview}`
    : "";

  const systemPrompt = `You are an intelligent meeting assistant for MeetScribe.
You have full access to the transcript of a specific meeting and its summary.
Answer questions ONLY based on what was discussed in this meeting.
If something was not discussed, say so clearly.
Be concise, helpful, and reference specific speakers when relevant.

${summaryText}

Full Meeting Transcript:
${transcript}`;

  chatSessions.set(sessionId, {
    systemPrompt,
    messages: [],
    transcript: transcriptEntries,
    summary: summaryData,
  });

  return true;
}

async function chatWithMeeting(sessionId, userMessage, transcriptEntries, summaryData) {
  if (!chatSessions.has(sessionId)) {
    initChatSession(sessionId, transcriptEntries, summaryData);
  }

  const session = chatSessions.get(sessionId);
  
  // Build conversation history for this request
  const conversationHistory = session.messages.map(msg => 
    msg.role === "user" ? ["human", msg.content] : ["assistant", msg.content]
  );

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", session.systemPrompt],
    ...conversationHistory,
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const assistantMessage = await chain.invoke({ input: userMessage });

  // Update session message history
  session.messages.push({ role: "user", content: userMessage });
  session.messages.push({ role: "assistant", content: assistantMessage });

  return {
    answer: assistantMessage,
    messages: session.messages,
  };
}

function getChatHistory(sessionId) {
  if (!chatSessions.has(sessionId)) return [];
  return chatSessions.get(sessionId).messages;
}

function clearChatSession(sessionId) {
  chatSessions.delete(sessionId);
}

module.exports = {
  summarizeTranscript,
  initChatSession,
  chatWithMeeting,
  getChatHistory,
  clearChatSession,
};