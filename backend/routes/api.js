const express = require("express");
const router = express.Router();
const { db } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const MeetBot = require("../bot/meetBot");
const {
  summarizeTranscript,
  chatWithMeeting,
  getChatHistory,
  clearChatSession,
  initChatSession,
} = require("../services/langchainService");
const {
  saveMeeting,
  generatePdf,
  getMeeting,
  deleteMeeting,
  getShareLink,
  getPdfLink,
  getPdfBuffer,
  listMeetings,
} = require("../services/storageService");

// In-memory active bot sessions { sessionId: MeetBot }
const activeBots = new Map();

// ─── BOT CONTROL ─────────────────────────────────────────────────────────────

// Start bot
router.post("/bot/start", async (req, res) => {
  const { meetUrl } = req.body;
  const userId = req.user.uid;

  if (!meetUrl?.includes("meet.google.com")) {
    return res.status(400).json({ error: "Invalid Google Meet URL" });
  }

  const sessionId = uuidv4();
  const io = req.app.get("io");

  const bot = new MeetBot(sessionId, meetUrl, io);
  activeBots.set(sessionId, bot);

  // Launch async, errors emitted via socket
  bot.launch().catch((err) => {
    io.to(sessionId).emit("bot-error", { message: err.message });
    activeBots.delete(sessionId);
  });

  res.json({ sessionId });
});

// Stop bot + generate summary (BUT DON'T SAVE YET)
router.post("/bot/stop", async (req, res) => {
  const { sessionId } = req.body;
  const userId = req.user.uid;
  const bot = activeBots.get(sessionId);

  if (!bot) return res.status(404).json({ error: "Session not found" });

  const io = req.app.get("io");
  io.to(sessionId).emit("bot-status", { status: "summarizing", message: "Generating AI summary..." });

  try {
    const transcript = await bot.stop();
    activeBots.delete(sessionId);

    if (!transcript.length) {
      return res.status(400).json({ error: "No transcript was captured" });
    }

    console.log(`\n=== STOPPING BOT: ${sessionId} ===`);
    console.log(`Transcript entries: ${transcript.length}`);
    console.log(`Generating summary...`);

    // AI summarize
    const summary = await summarizeTranscript(transcript);
    console.log(`✓ Summary generated: ${summary.title}`);

    // Store in memory temporarily (don't save to files yet)
    global.tempMeetingData = global.tempMeetingData || {};
    global.tempMeetingData[sessionId] = {
      userId,
      sessionId,
      summary,
      transcript,
      createdAt: new Date().toISOString(),
    };
    
    console.log(`✓ Meeting data stored in memory (not saved to dashboard yet)`);

    // Init chatbot session
    initChatSession(sessionId, transcript, summary);
    console.log(`✓ Chat session initialized`);

    // Respond immediately
    res.json({ 
      success: true, 
      sessionId, 
      message: "Summary generated" 
    });

    // Emit socket event after short delay
    setTimeout(() => {
      io.to(sessionId).emit("summary-ready", { sessionId });
      console.log(`=== SUMMARY READY: ${sessionId} ===\n`);
    }, 300);

  } catch (err) {
    console.error("Stop error:", err);
    res.status(500).json({ error: err.message });
  }
});

// SAVE meeting to dashboard (user explicitly clicks Save)
router.post("/meetings/:sessionId/save", async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.uid;

  try {
    // Get from temp storage or already saved
    let meetingData = null;
    
    if (global.tempMeetingData && global.tempMeetingData[sessionId]) {
      meetingData = global.tempMeetingData[sessionId];
      console.log(`Found meeting in temp storage: ${sessionId}`);
    } else {
      // Try to load from existing saved meetings
      meetingData = await getMeeting(userId, sessionId);
      if (meetingData) {
        console.log(`Meeting already saved: ${sessionId}`);
        return res.json({ success: true, message: "Meeting is already saved to dashboard", alreadySaved: true });
      }
    }

    if (!meetingData) {
      return res.status(404).json({ error: "Meeting data not found. The session may have expired." });
    }

    console.log(`Saving meeting ${sessionId} to dashboard...`);

    // Save to local storage (this adds to dashboard)
    await saveMeeting(userId, sessionId, meetingData.summary, meetingData.transcript);
    console.log(`✓ Meeting saved to local storage`);

    // Generate PDF (await so it's ready before response)
    try {
      const pdfSuccess = await generatePdf(userId, sessionId, meetingData.summary, meetingData.transcript);
      if (pdfSuccess) {
        console.log(`✓ PDF generated for session ${sessionId}`);
      } else {
        console.log(`⚠ PDF generation failed for session ${sessionId}`);
      }
    } catch (pdfErr) {
      console.error("PDF generation error:", pdfErr.message);
    }

    // Save to Firestore for fast listing (OPTIONAL - won't fail if Firestore is down)
    try {
      if (db && db.collection) {
        await db.collection("meetings").doc(sessionId).set({
          userId,
          sessionId,
          title: meetingData.summary.title || "Untitled Meeting",
          overview: meetingData.summary.overview || "",
          sentiment: meetingData.summary.sentiment || "neutral",
          createdAt: meetingData.createdAt || new Date().toISOString(),
          transcriptCount: meetingData.transcript.length,
        });
        console.log("✓ Firestore metadata saved");
      } else {
        console.log("ℹ Firestore not available, skipping metadata save");
      }
    } catch (firestoreErr) {
      console.log("⚠ Firestore save failed (continuing anyway):", firestoreErr.message);
      // Don't throw - meeting is still saved to local storage
    }

    // Remove from temp storage
    if (global.tempMeetingData) {
      delete global.tempMeetingData[sessionId];
    }

    console.log(`✓✓ Meeting ${sessionId} successfully saved to dashboard!`);

    res.json({ 
      success: true, 
      message: "Meeting saved to dashboard",
      title: meetingData.summary.title
    });
  } catch (err) {
    console.error("Save error:", err);
    // Even if there's an error, check if the file was saved
    try {
      const existingData = await getMeeting(userId, sessionId);
      if (existingData) {
        console.log("Meeting file exists despite error, returning success");
        return res.json({ success: true, message: "Meeting saved (with warnings)", title: existingData.summary.title });
      }
    } catch (_) {}
    
    res.status(500).json({ error: err.message || "Failed to save meeting" });
  }
});

// Get live transcript for active session
router.get("/bot/transcript/:sessionId", (req, res) => {
  const bot = activeBots.get(req.params.sessionId);
  if (!bot) return res.status(404).json({ error: "Session not found" });
  res.json({ transcript: bot.getTranscript() });
});

// ─── MEETINGS HISTORY ─────────────────────────────────────────────────────────

// List all meetings for user (from local storage — fast, no GCP needed)
router.get("/meetings", async (req, res) => {
  try {
    const userId = req.user.uid;
    console.log(`📋 GET /meetings - User ID: ${userId}`);
    const meetings = await listMeetings(userId);
    res.json({ meetings });
  } catch (err) {
    console.error("GET /meetings error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get full meeting data (summary + transcript) from temp storage OR local storage
router.get("/meetings/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    console.log(`GET /meetings/${sessionId} - Loading meeting data...`);
    
    // First check temp storage (for unsaved meetings) - NO userId check needed
    if (global.tempMeetingData && global.tempMeetingData[sessionId]) {
      const data = { ...global.tempMeetingData[sessionId] };
      data._saved = false;
      console.log("✓ Loaded from TEMP storage:", sessionId);
      return res.json(data);
    }
    
    // Try saved meetings (requires userId match)
    console.log("Not in temp, trying saved meetings...");
    const data = await getMeeting(req.user.uid, sessionId);
    
    if (data) {
      data._saved = true;
      console.log("✓ Loaded from SAVED meetings:", sessionId);
      return res.json(data);
    }
    
    // Not found anywhere
    console.error(`✗ Meeting NOT FOUND: ${sessionId}`);
    console.log("Temp sessions:", global.tempMeetingData ? Object.keys(global.tempMeetingData) : "none");
    
    return res.status(404).json({ 
      error: "Meeting not found", 
      sessionId: sessionId,
      hint: "The meeting may have been cleared from memory."
    });
  } catch (err) {
    console.error("Get meeting error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete meeting
router.delete("/meetings/:sessionId", async (req, res) => {
  try {
    await deleteMeeting(req.user.uid, req.params.sessionId);
    
    // Also delete from Firestore if it exists
    try {
      await db.collection("meetings").doc(req.params.sessionId).delete();
    } catch (_) {
      // Firestore delete is optional
    }
    
    clearChatSession(req.params.sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MEETING CHATBOT ──────────────────────────────────────────────────────────

// Send message to meeting chatbot
router.post("/meetings/:sessionId/chat", async (req, res) => {
  const { message } = req.body;
  const { sessionId } = req.params;

  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  try {
    // Load transcript + summary if session not in memory (e.g. after server restart)
    if (!getChatHistory(sessionId).length) {
      const data = await getMeeting(req.user.uid, sessionId);
      if (!data) return res.status(404).json({ error: "Meeting not found" });
      initChatSession(sessionId, data.transcript, data.summary);
    }

    // Get transcript + summary for context (already in memory after init)
    const data = await getMeeting(req.user.uid, sessionId);
    const result = await chatWithMeeting(
      sessionId,
      message,
      data?.transcript || [],
      data?.summary || null
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get chat history for a meeting
router.get("/meetings/:sessionId/chat", (req, res) => {
  const history = getChatHistory(req.params.sessionId);
  res.json({ messages: history });
});

// ─── SHARE + PDF ──────────────────────────────────────────────────────────────

// Generate share link
router.post("/meetings/:sessionId/share", async (req, res) => {
  try {
    const url = await getShareLink(req.user.uid, req.params.sessionId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get PDF download link
router.get("/meetings/:sessionId/pdf", async (req, res) => {
  try {
    const userId = req.user.uid;
    const { sessionId } = req.params;
    
    // Check if PDF already exists
    let url = await getPdfLink(userId, sessionId);
    
    if (!url) {
      // PDF doesn't exist yet - try to generate it from saved meeting data
      console.log(`PDF not found, generating for session ${sessionId}...`);
      const meetingData = await getMeeting(userId, sessionId);
      
      if (meetingData && meetingData.summary && meetingData.transcript) {
        const pdfSuccess = await generatePdf(userId, sessionId, meetingData.summary, meetingData.transcript);
        if (pdfSuccess) {
          url = await getPdfLink(userId, sessionId);
        }
      }
    }
    
    if (!url) return res.status(404).json({ error: "PDF not found" });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download PDF file
router.get("/meetings/:sessionId/pdf/download", async (req, res) => {
  try {
    const pdfBuffer = await getPdfBuffer(req.user.uid, req.params.sessionId);
    if (!pdfBuffer) return res.status(404).json({ error: "PDF not found" });
    
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="meeting-${req.params.sessionId}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;