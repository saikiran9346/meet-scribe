require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const apiRoutes = require("./routes/api");
const { verifyToken } = require("./middleware/auth");
console.log("Firebase Auth initialized");

// Initialize global temp storage
global.tempMeetingData = {};

const app = express();
const server = http.createServer(app);

// Socket setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.set("io", io);

// ✅ Root route (FIX for your issue)
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// ✅ Health check (already good)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── PUBLIC SHARE (no auth required) ─────────────────────────────────────────
app.get("/api/share/:sessionId", async (req, res) => {
  try {
    const fs = require("fs").promises;
    const fsSync = require("fs");
    const path = require("path");
    const LOCAL_DIR = path.join(__dirname, "data/meetings");
    const { sessionId } = req.params;

    const userDirsPath = path.join(LOCAL_DIR);
    if (!fsSync.existsSync(userDirsPath)) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const userDirs = await fs.readdir(userDirsPath);

    for (const userId of userDirs) {
      const meetingPath = path.join(userDirsPath, userId, `${sessionId}.json`);
      if (fsSync.existsSync(meetingPath)) {
        const content = await fs.readFile(meetingPath, "utf-8");
        const meetingData = JSON.parse(content);

        res.json({
          sessionId: meetingData.sessionId,
          summary: meetingData.summary,
          transcript: meetingData.transcript,
          createdAt: meetingData.createdAt,
        });
        return;
      }
    }

    res.status(404).json({ error: "Meeting not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔒 Protected API routes
app.use("/api", verifyToken, apiRoutes);

// Socket.IO
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Joined session: ${sessionId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Server start
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});