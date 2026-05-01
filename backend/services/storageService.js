const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Local storage directory
const LOCAL_DIR = path.join(__dirname, "../data/meetings");

// Ensure directory exists
async function ensureDir() {
  try {
    await fs.mkdir(LOCAL_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      console.error("Error creating data directory:", err.message);
    }
  }
}

// Ensure user directory exists
async function ensureUserDir(userId) {
  const userDir = path.join(LOCAL_DIR, userId);
  try {
    await fs.mkdir(userDir, { recursive: true });
    return userDir;
  } catch (err) {
    console.error("Error creating user directory:", err.message);
    return null;
  }
}

// Get bucket placeholder (we use local storage, not GCP)
async function getBucket() {
  // This is a no-op for local storage mode
  return null;
}

// Save meeting to LOCAL storage
async function saveMeeting(userId, sessionId, summary, transcript) {
  await ensureDir();
  const userDir = await ensureUserDir(userId);
  if (!userDir) throw new Error("Failed to create user directory");

  const filePath = path.join(userDir, `${sessionId}.json`);
  
  const payload = {
    sessionId,
    userId,
    createdAt: new Date().toISOString(),
    summary,
    transcript,
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`✓ Meeting saved to local storage: ${filePath}`);
  return filePath;
}

// Generate PDF from meeting data
async function generatePdf(userId, sessionId, summary, transcript) {
  try {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const blue = rgb(0.14, 0.38, 0.87);
    const gray = rgb(0.4, 0.4, 0.4);
    const darkGray = rgb(0.1, 0.1, 0.1);

    const addText = (page, text, x, y, size, font, color) => {
      page.drawText(text, { x, y, size, font, color });
    };

    const wrapText = (text, maxWidth, fontSize) => {
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = helveticaFont.widthOfTextAtSize(testLine, fontSize);
        if (width > maxWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Page 1: Title + Overview
    let page = pdfDoc.addPage([595, 842]); // A4
    const margin = 50;
    let y = 780;
    const contentWidth = 495;

    // Title
    addText(page, summary.title || "Meeting Summary", margin, y, 24, helveticaBold, blue);
    y -= 30;

    // Meta info
    addText(page, `Sentiment: ${summary.sentiment || "N/A"}`, margin, y, 10, helveticaFont, gray);
    y -= 15;
    addText(page, `Date: ${new Date().toLocaleString()}`, margin, y, 10, helveticaFont, gray);
    y -= 35;

    // Overview
    addText(page, "OVERVIEW", margin, y, 14, helveticaBold, blue);
    y -= 22;
    
    const overviewLines = wrapText(summary.overview || "No overview available", contentWidth, 11);
    for (const line of overviewLines) {
      if (y < 50) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      addText(page, line, margin, y, 11, helveticaFont, darkGray);
      y -= 16;
    }
    y -= 10;

    // Key Decisions
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "KEY DECISIONS", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const decisions = summary.keyDecisions || [];
    if (decisions.length === 0) {
      addText(page, "No decisions identified", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      decisions.forEach((d, i) => {
        if (y < 60) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, `${i + 1}.`, margin, y, 11, helveticaBold, blue);
        const lines = wrapText(d, contentWidth - 20, 11);
        lines.forEach((line, j) => {
          if (j === 0) addText(page, line, margin + 20, y, 11, helveticaFont, darkGray);
          else {
            if (y < 50) { page = pdfDoc.addPage([595, 842]); y = 780; }
            addText(page, line, margin + 20, y, 11, helveticaFont, darkGray);
          }
          y -= 16;
        });
        y -= 4;
      });
    }
    y -= 10;

    // Action Items
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "ACTION ITEMS", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const actions = summary.actionItems || [];
    if (actions.length === 0) {
      addText(page, "No action items identified", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      actions.forEach((item, i) => {
        if (y < 80) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, `${i + 1}. ${item.task}`, margin, y, 11, helveticaFont, darkGray);
        y -= 16;
        addText(page, `   Owner: ${item.owner || "N/A"} | Priority: ${item.priority || "medium"}`, margin, y, 10, helveticaFont, gray);
        y -= 20;
      });
    }
    y -= 5;

    // Speaker Breakdown
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "SPEAKER BREAKDOWN", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const speakers = summary.speakerBreakdown || [];
    if (speakers.length === 0) {
      addText(page, "No speaker data available", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      speakers.forEach((s) => {
        if (y < 60) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, s.speaker, margin, y, 11, helveticaBold, blue);
        y -= 16;
        const lines = wrapText(s.summary, contentWidth, 11);
        for (const line of lines) {
          if (y < 50) { page = pdfDoc.addPage([595, 842]); y = 780; }
          addText(page, line, margin + 10, y, 11, helveticaFont, darkGray);
          y -= 16;
        }
        y -= 6;
      });
    }

    // Save PDF
    const pdfBuffer = await pdfDoc.save();
    await savePdf(userId, sessionId, pdfBuffer);
    console.log(`✓ PDF generated and saved for session ${sessionId}`);
    return true;
  } catch (err) {
    console.error("Error generating PDF:", err);
    return false;
  }
}

// Save PDF file locally
async function savePdf(userId, sessionId, pdfBuffer) {
  await ensureDir();
  const userDir = await ensureUserDir(userId);
  const pdfDir = path.join(LOCAL_DIR, userId, "pdfs");
  await fs.mkdir(pdfDir, { recursive: true });

  const filePath = path.join(pdfDir, `${sessionId}.pdf`);
  await fs.writeFile(filePath, pdfBuffer);
  return filePath;
}

// Get full meeting data by sessionId from local storage
async function getMeeting(userId, sessionId) {
  await ensureDir();

  // Check BOTH possible locations
  const locations = [
    path.join(LOCAL_DIR, userId),                    // data/meetings/{userId}
    path.join(__dirname, "../data", userId),         // data/{userId}
  ];

  for (const dir of locations) {
    const filePath = path.join(dir, `${sessionId}.json`);

    try {
      const exists = fsSync.existsSync(filePath);
      if (exists) {
        const content = await fs.readFile(filePath, "utf-8");
        console.log(`✅ Meeting loaded from: ${filePath}`);
        return JSON.parse(content);
      }
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err.message);
    }
  }

  return null;
}

// List all meetings for a user from local storage
async function listMeetings(userId) {
  await ensureDir();
  const allMeetings = [];

  // Check BOTH possible locations:
  // 1. data/meetings/{userId}/ (current standard location)
  // 2. data/{userId}/ (legacy location)
  const locations = [
    path.join(LOCAL_DIR, userId),                    // data/meetings/{userId}
    path.join(__dirname, "../data", userId),         // data/{userId}
  ];

  for (const userDir of locations) {
    if (!fsSync.existsSync(userDir)) {
      console.log(`⚠️ Directory not found: ${userDir}`);
      continue;
    }

    try {
      const files = await fs.readdir(userDir);
      console.log(`📂 Scanning ${userDir}: ${files.length} files`);

      for (const file of files) {
        // Only process .json files (not pdfs folder)
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(userDir, file);
          const content = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(content);

          // Avoid duplicates if same sessionId exists in both locations
          if (!allMeetings.find(m => m.sessionId === data.sessionId)) {
            allMeetings.push({
              sessionId: data.sessionId,
              title: data.summary?.title || "Untitled Meeting",
              overview: data.summary?.overview || "",
              sentiment: data.summary?.sentiment || "neutral",
              createdAt: data.createdAt,
              transcriptCount: data.transcript?.length || 0,
            });
          }
        } catch (err) {
          console.error(`Error reading meeting file ${file}:`, err.message);
          // Skip corrupted files
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${userDir}:`, err.message);
    }
  }

  // Sort by creation date (newest first)
  allMeetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  console.log(`✅ Total meetings found for user ${userId}: ${allMeetings.length}`);
  return allMeetings;
}

// Delete a meeting from local storage
async function deleteMeeting(userId, sessionId) {
  await ensureDir();

  // Check BOTH possible locations
  const locations = [
    path.join(LOCAL_DIR, userId),                    // data/meetings/{userId}
    path.join(__dirname, "../data", userId),         // data/{userId}
  ];

  for (const dir of locations) {
    const filePath = path.join(dir, `${sessionId}.json`);
    const pdfPath = path.join(dir, "pdfs", `${sessionId}.pdf`);

    try {
      // Delete meeting JSON file
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
        console.log(`✓ Deleted meeting: ${filePath}`);
      }

      // Delete PDF if exists
      if (fsSync.existsSync(pdfPath)) {
        await fs.unlink(pdfPath);
        console.log(`✓ Deleted PDF: ${pdfPath}`);
      }
    } catch (err) {
      console.error("Error deleting meeting:", err.message);
      // Don't throw - file might not exist
    }
  }
}

// Generate a share link (returns full frontend URL)
async function getShareLink(userId, sessionId) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/share/${sessionId}`;
}

// Generate PDF download link
async function getPdfLink(userId, sessionId) {
  await ensureDir();
  const pdfPath = path.join(LOCAL_DIR, userId, "pdfs", `${sessionId}.pdf`);
  
  if (!fsSync.existsSync(pdfPath)) return null;
  
  return `/api/meetings/${sessionId}/pdf/download`;
}

// Get PDF file buffer
async function getPdfBuffer(userId, sessionId) {
  await ensureDir();
  const pdfPath = path.join(LOCAL_DIR, userId, "pdfs", `${sessionId}.pdf`);
  
  if (!fsSync.existsSync(pdfPath)) return null;
  
  return await fs.readFile(pdfPath);
}

module.exports = {
  saveMeeting,
  generatePdf,
  savePdf,
  getMeeting,
  deleteMeeting,
  getShareLink,
  getPdfLink,
  getPdfBuffer,
  listMeetings,
};
