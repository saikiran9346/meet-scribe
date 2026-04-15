require("dotenv").config();
const puppeteer = require("puppeteer");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const os = require("os");

class MeetBot {
  constructor(sessionId, meetUrl, io) {
    this.sessionId = sessionId;
    this.meetUrl = meetUrl;
    this.io = io;
    this.browser = null;
    this.page = null;
    this.transcript = [];
    this.isRunning = false;
    this.recognizeStream = null;
    this.keepAlive = null;
    this.participantNames = [];
    this._currentSpeaker = null;
    this._lastSpeaker = null;
    this._lastEntryId = null;
    this.chunksSent = 0;
    this._audioQueue = []; // Buffer for audio chunks before Deepgram connects
  }

  emit(event, data) {
    this.io.to(this.sessionId).emit(event, data);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _detectBrowser() {
    const homeDir = os.homedir();
    const browserPaths = [
      path.join(process.env.PROGRAMFILES || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(homeDir, "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env.PROGRAMFILES || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      path.join(homeDir, "AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      path.join(process.env.PROGRAMFILES || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    ];
    for (const p of browserPaths) {
      try {
        if (fs.existsSync(p)) {
          console.log("✅ Found browser:", p);
          return p;
        }
      } catch (_) {}
    }
    return null;
  }

  async launch() {
    this.isRunning = true;
    this.emit("bot-status", { status: "launching", message: "Starting browser..." });

    const browserPath = this._detectBrowser();
    const userDataDir = path.join(os.tmpdir(), "meet-scribe-browser-data");
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    // Use headless mode in Docker/Linux environments without display
    // Detect Render, Docker, or Production environment
    const isServer = process.env.RENDER === "true" || fs.existsSync("/.dockerenv") || process.env.NODE_ENV === "production";
    const launchOptions = {
      headless: isServer ? "new" : false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--disable-infobars",
        "--lang=en-US",
        "--window-size=1366,768",
        "--window-position=0,0",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--enable-usermedia-screen-capturing",
        "--force-device-scale-factor=1",
        "--mute-audio",
        `--user-data-dir=${userDataDir}`,
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    };

    if (browserPath) launchOptions.executablePath = browserPath;

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Anti-detection
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "vendor", { get: () => "Google Inc." });
      delete window.callPhantom;
      delete window._phantom;
      delete window.domAutomation;
      delete window.domAutomationController;
      window.chrome = {
        runtime: { connect: () => {}, onMessage: { addListener: () => {} } },
        loadTimes: () => ({}),
        app: {},
      };
    });

    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    const ctx = this.browser.defaultBrowserContext();
    await ctx.overridePermissions("https://meet.google.com", ["microphone", "camera"]);
    await ctx.overridePermissions("https://accounts.google.com", ["microphone", "camera"]);

    this.page.on("console", (msg) => {
      const text = msg.text();
      if (!text.includes("Invalid keyframe") && !text.includes("third-party")) {
        console.log("📄 Page:", text.substring(0, 150));
      }
    });
    this.page.on("error", (err) => console.error("❌ Page error:", err.message));

    // Expose functions
    await this.page.exposeFunction("sendAudioChunk", async (base64Chunk) => {
      const buffer = Buffer.from(base64Chunk, "base64");

      if (this.recognizeStream && this.recognizeStream.readyState === 1) {
        // Flush queued audio first
        while (this._audioQueue.length > 0) {
          const chunk = this._audioQueue.shift();
          this.recognizeStream.send(chunk);
          this.chunksSent++;
        }
        // Send current chunk
        this.recognizeStream.send(buffer);
        this.chunksSent++;
        if (this.chunksSent % 50 === 0) {
          console.log(`📤 Sent ${this.chunksSent} audio chunks`);
        }
      } else {
        // Queue audio for when stream connects (max ~5 minutes of audio buffer)
        if (this._audioQueue.length < 1500) {
          this._audioQueue.push(buffer);
        } else {
          console.log(`⚠️ Audio queue full (${this._audioQueue.length} chunks), dropping oldest`);
        }
      }
    });

    await this.page.exposeFunction("onCaptionUpdate", (speakerName) => {
      if (speakerName && speakerName.trim().length > 0 && speakerName.trim().length < 50) {
        const name = speakerName.trim();
        if (name !== this._currentSpeaker) {
          this._currentSpeaker = name;
          console.log(`🗣️ Caption speaker: ${name}`);
        }
      }
    }).catch(() => {});

    // WebRTC audio interceptor
    await this.page.evaluateOnNewDocument(() => {
      window._audioContext = null;
      window._audioProcessor = null;
      window._audioTrackCount = 0;

      const OrigRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function (...args) {
        const pc = new OrigRTC(...args);
        pc.addEventListener("track", (e) => {
          if (e.track.kind !== "audio") return;
          window._audioTrackCount++;
          console.log(`🎤 Audio track #${window._audioTrackCount} captured`);

          if (!window._audioContext) {
            window._audioContext = new AudioContext({ sampleRate: 16000 });
          }
          if (window._audioContext.state === "suspended") {
            window._audioContext.resume();
          }

          const stream = new MediaStream([e.track.clone()]);
          const src = window._audioContext.createMediaStreamSource(stream);

          if (!window._audioProcessor) {
            window._audioProcessor = window._audioContext.createScriptProcessor(4096, 1, 1);
            window._audioProcessor.connect(window._audioContext.destination);

            let count = 0;
            window._audioProcessor.onaudioprocess = (ev) => {
              const data = ev.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(data.length);
              for (let i = 0; i < data.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
              }
              const uint8 = new Uint8Array(pcm16.buffer);
              let binary = "";
              for (let j = 0; j < uint8.length; j++) {
                binary += String.fromCharCode(uint8[j]);
              }
              count++;
              if (count % 100 === 0) console.log(`🎵 Chunks: ${count}`);
              if (typeof window.sendAudioChunk === "function") {
                window.sendAudioChunk(btoa(binary));
              }
            };
            console.log("✅ Audio processor ready");
          }

          src.connect(window._audioProcessor);
          console.log(`✅ Track #${window._audioTrackCount} connected`);
        });
        return pc;
      };
      Object.keys(OrigRTC).forEach((k) => { window.RTCPeerConnection[k] = OrigRTC[k]; });
      console.log("✅ WebRTC interceptor installed");
    });

    await this._signInToGoogle();
    await this._joinMeeting();
  }

  async _signInToGoogle() {
    const email = process.env.BOT_EMAIL;
    const password = process.env.BOT_PASSWORD;

    if (!email || !password) {
      console.log("⚠️ BOT_EMAIL or BOT_PASSWORD not set. Waiting for manual login...");
      this.emit("bot-status", { status: "waiting-signin", message: "Please sign in to Google in the browser window." });
      await this.page.waitForSelector("[data-email]", { timeout: 120000 }).catch(() => {});
      return;
    }

    console.log("🔐 Attempting auto-login...");
    this.emit("bot-status", { status: "waiting-signin", message: "Bot is logging in..." });

    try {
      // 1. Go to Google Sign In
      await this.page.goto("https://accounts.google.com", { waitUntil: "networkidle2", timeout: 30000 });
      
      // 2. Type Email
      await this.page.waitForSelector("input[type='email']", { timeout: 10000 });
      await this.page.type("input[type='email']", email, { delay: 50 });
      await this.sleep(1000);
      
      // 3. Click Next
      const nextBtn = await this.page.$("#identifierNext");
      if (nextBtn) await nextBtn.click();
      else await this.page.keyboard.press("Enter");
      
      // 4. Handle "This looks unfamiliar" or "Verify it's you"
      try {
        const suspiciousBtn = await this.page.waitForSelector("button[jsname='O0EWce'], button:has-text('Yes, it\\'s me'), div[role='button']:has-text('Yes')", { timeout: 5000 });
        if (suspiciousBtn) {
          console.log("🛡️ Found 'Verify it's you' prompt. Clicking...");
          await suspiciousBtn.click();
          await this.sleep(2000);
        }
      } catch (e) { /* No prompt, continue */ }

      // 5. Type Password
      await this.page.waitForSelector("input[type='password']", { timeout: 15000 });
      await this.page.type("input[type='password']", password, { delay: 50 });
      await this.sleep(1000);
      
      // 6. Click Next
      const passNextBtn = await this.page.$("#passwordNext");
      if (passNextBtn) await passNextBtn.click();
      else await this.page.keyboard.press("Enter");

      // 7. Wait for successful login (redirect to Google or Meet)
      console.log("⏳ Waiting for login to complete...");
      await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
      
      console.log("✅ Auto-login successful!");
    } catch (err) {
      console.error("❌ Auto-login failed:", err.message);
      console.log("⏳ Falling back to manual sign-in wait...");
      this.emit("bot-status", { status: "waiting-signin", message: "Login failed. Please check credentials." });
      await this.sleep(60000); // Wait a bit before failing
    }
  }

    await this.sleep(2000);
    await this.page.screenshot({ path: "signin-page.png" });
    console.log("📸 Sign-in page open — please sign in manually");

    const MAX_WAIT = 5 * 60 * 1000;
    const CHECK_INTERVAL = 2000;
    let elapsed = 0;

    while (elapsed < MAX_WAIT) {
      try {
        const url = this.page.url();
        if (url.includes("google.com") && !url.includes("accounts.google.com")) {
          console.log("✅ Sign-in detected!");
          this.emit("bot-status", { status: "success", message: "Signed in! Going to meeting..." });
          await this.sleep(2000);
          return;
        }
        if (url.includes("myaccount.google.com")) {
          console.log("✅ Account page — signed in!");
          this.emit("bot-status", { status: "success", message: "Signed in! Going to meeting..." });
          await this.sleep(2000);
          return;
        }
      } catch (_) {}

      await this.sleep(CHECK_INTERVAL);
      elapsed += CHECK_INTERVAL;

      if (elapsed % 30000 === 0) {
        console.log(`⏳ Waiting for sign-in... (${Math.floor(elapsed / 1000)}s)`);
        this.emit("bot-status", {
          status: "waiting-signin",
          message: `Waiting for sign-in... (${Math.floor(elapsed / 1000)}s)`,
        });
      }
    }

    console.log("⚠️ Sign-in timeout. Proceeding...");
    await this.sleep(2000);
  }

  async _joinMeeting() {
    this.emit("bot-status", { status: "joining", message: "Opening Google Meet..." });

    try {
      await this.page.goto(this.meetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await this.sleep(5000);

      await this.page.evaluate(() => { window.scrollTo(0, 0); });
      await this.page.screenshot({ path: "meet-loading.png" });

      const pageText = await this.page.evaluate(() => document.body.innerText);
      console.log("📄 Page preview:", pageText.substring(0, 200));

      if (
        pageText.includes("You can't join this video call") &&
        !pageText.includes("Join now") &&
        !pageText.includes("Ask to join")
      ) {
        this.emit("bot-status", { status: "error", message: "Can't join this meeting." });
        return;
      }

      await this.sleep(2000);

      // Enter name
      try {
        const nameInput =
          (await this.page.$('input[aria-label="Your name"]')) ||
          (await this.page.$('input[placeholder="Your name"]'));
        if (nameInput) {
          await nameInput.click({ clickCount: 3 });
          await nameInput.type("AI Scribe");
          console.log("✅ Name entered");
        }
      } catch (_) {}

      // Turn off mic
      try {
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) => {
            const l = b.getAttribute("aria-label") || "";
            return (l.includes("microphone") || l.includes("mic")) && !l.includes("Leave");
          });
          if (btn) btn.click();
        });
        await this.sleep(500);
        console.log("✅ Mic off");
      } catch (_) {}

      // Turn off camera
      try {
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) => {
            const l = b.getAttribute("aria-label") || "";
            return (l.includes("camera") || l.includes("video")) && !l.includes("Leave");
          });
          if (btn) btn.click();
        });
        await this.sleep(500);
        console.log("✅ Camera off");
      } catch (_) {}

      await this.sleep(1500);

      // Click join — prioritize "Join now"
      let joined = false;
      let joinType = "";

      const result = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = btn.innerText?.trim().toLowerCase() || "";
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && !btn.disabled && text === "join now") {
            btn.click();
            return "join now";
          }
        }
        for (const btn of buttons) {
          const text = btn.innerText?.trim().toLowerCase() || "";
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && !btn.disabled && text === "ask to join") {
            btn.click();
            return "ask to join";
          }
        }
        return null;
      }).catch(() => null);

      if (result) {
        joined = true;
        joinType = result;
        console.log("✅ Clicked:", result);
      }

      if (!joined) {
        this.emit("bot-status", { status: "error", message: "Could not find join button." });
        return;
      }

      await this.sleep(8000);

      if (joinType === "join now") {
        console.log("✅ Joined open meeting directly!");
        this.emit("bot-status", { status: "joined", message: "Bot joined! Listening..." });
        await this.sleep(2000);
        await this._startTranscription();
        return;
      }

      // Wait to be admitted
      console.log("⏳ Waiting to be admitted...");
      this.emit("bot-status", {
        status: "joining",
        message: "Waiting to be admitted — please admit 'AI Scribe' from your meeting",
      });

      let admitted = false;
      for (let i = 0; i < 100; i++) {
        await this.sleep(2000);
        try {
          const state = await this.page.evaluate(() => {
            const text = document.body?.innerText || "";
            return {
              hasCallEnd: text.includes("Leave call"),
              hasMute: text.includes("Mute microphone") || text.includes("Turn on microphone"),
              hasWaiting: text.includes("Still trying to get in") || text.includes("Waiting for the host"),
              leftMeeting: text.includes("You left") || text.includes("You've been removed"),
            };
          });

          console.log(`⏳ ${i + 1}: callEnd=${state.hasCallEnd} mute=${state.hasMute} waiting=${state.hasWaiting}`);

          if (state.hasWaiting) {
            this.emit("bot-status", {
              status: "joining",
              message: "Waiting to be admitted — please click 'Admit' in your Chrome meeting",
            });
          }

          if ((state.hasCallEnd || state.hasMute) && !state.hasWaiting) {
            admitted = true;
            console.log("✅ Admitted!");
            break;
          }

          if (state.leftMeeting) {
            this.emit("bot-status", { status: "error", message: "Bot was removed." });
            return;
          }
        } catch (err) {
          if (err.message.includes("detached")) await this.sleep(1000);
        }
      }

      if (admitted) {
        await this.sleep(3000);
        this.emit("bot-status", { status: "joined", message: "Bot joined! Listening..." });
        await this._startTranscription();
      } else {
        this.emit("bot-status", {
          status: "error",
          message: "Bot was not admitted. Please admit 'AI Scribe'.",
        });
      }
    } catch (err) {
      console.error("❌ Join error:", err.message);
      this.emit("bot-status", { status: "error", message: "Failed to join: " + err.message });
    }
  }

  async _startTranscription() {
    console.log("🎤 Starting transcription...");
    await this._connectDeepgram();
    this._startParticipantScraper();
    await this._enableCaptions();
    console.log("✅ Transcription pipeline ready");
  }

  async _enableCaptions() {
    console.log("💬 Enabling captions...");
    try {
      await this.sleep(3000);
      
      // Turn on captions with 'C' key
      await this.page.keyboard.press("C");
      await this.sleep(1000);
      
      // Click video to focus
      await this.page.click("[data-participant-id]").catch(() => {});
      await this.sleep(1000);
      
      // Press 'C' again to ensure they stay on
      await this.page.keyboard.press("C");
      await this.sleep(1000);

      console.log("✅ Captions enabled");

      // Keep captions on: watch for them turning off and re-enable
      await this.page.evaluate(() => {
        let captionsOn = true;
        
        // Watch for caption container appearing/disappearing
        const observer = new MutationObserver(() => {
          const captionBox = document.querySelector(".a4cQT, .TBnnec, .CNusmb, .iOzk7, [jsname='tgaKEf'], [data-message-text]");
          if (!captionBox && captionsOn) {
            console.log("🔄 Captions turned off, re-enabling...");
            captionsOn = false;
            setTimeout(() => {
              document.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
              captionsOn = true;
            }, 500);
          } else if (captionBox) {
            captionsOn = true;
          }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Periodically ensure captions stay on
        setInterval(() => {
          const captionBox = document.querySelector(".a4cQT, .TBnnec, .CNusmb, .iOzk7, [jsname='tgaKEf'], [data-message-text]");
          if (!captionBox) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
          }
        }, 10000);
      });

      console.log("✅ Caption watcher active");

      // Start observing DOM for caption container AND active speaker
      await this.page.evaluate(() => {
        let retryCount = 0;
        const maxRetries = 20;

        // Exposed function to update the current speaker
        window._updateSpeaker = function(name) {
          if (name && name.length > 0 && name.length < 50) {
            if (typeof window.onCaptionUpdate === "function") {
              window.onCaptionUpdate(name);
            }
          }
        };

        function findAndObserveCaptions() {
          retryCount++;

          // All known Google Meet caption selectors (Updated for 2026)
          const selectors = [
            ".a4cQT",
            ".TBnnec",
            ".CNusmb",
            ".iOzk7",
            ".u3AOsd",
            "[jsname='tgaKEf']",
            "[jsname='GJ1sEc']",
            "[data-message-text]",
            "[class*='caption']",
            "[class*='Caption']",
            "[class*='transcript']",
            "div[aria-label='Live captions']",
          ];

          let container = null;
          for (const sel of selectors) {
            container = document.querySelector(sel);
            if (container) {
              console.log("✅ Caption container found:", sel);
              break;
            }
          }

          if (!container) {
            if (retryCount < maxRetries) {
              console.log(`⚠️ Caption container not found (attempt ${retryCount}/${maxRetries})`);
              setTimeout(findAndObserveCaptions, 3000);
            } else {
              console.log("⚠️ Caption container not found after all retries — using speaker detection fallback");
            }
            return;
          }

          const nameSelectors = [
            ".zs7s8d",
            ".KcIKyf",
            ".NWpY1d",
            "[class*='speaker']",
            "[class*='Speaker']",
            "[class*='name']",
            "[jsname='r4nke']",
          ];

          // Get the LAST (most recent) speaker name from captions
          // Google Meet appends new captions at the bottom, so the latest speaker is always last
          function getLatestSpeakerName() {
            for (const sel of nameSelectors) {
              const allEls = container.querySelectorAll(sel);
              if (allEls.length > 0) {
                // Get the LAST matching element (most recent caption)
                const lastEl = allEls[allEls.length - 1];
                const name = lastEl.innerText?.trim();
                if (name && name.length > 0 && name.length < 50) {
                  return name;
                }
              }
            }
            return null;
          }

          // Watch for DOM changes inside caption container
          const observer = new MutationObserver(() => {
            try {
              const name = getLatestSpeakerName();
              if (name) window._updateSpeaker(name);
            } catch (e) {}
          });

          observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true,
          });

          // Poll for active speaker every 1 second — more reliable than MutationObserver alone
          setInterval(() => {
            try {
              // Get the most recent caption speaker name
              let name = getLatestSpeakerName();

              // If no name in caption container, try the active speaker indicator in header
              if (!name) {
                const headerSelectors = [
                  "[data-participant-name]",
                  "[class*='active-speaker']",
                  "[class*='ActiveSpeaker']",
                  ".uVSpGf", // Active speaker label in header
                ];
                for (const sel of headerSelectors) {
                  const el = document.querySelector(sel);
                  if (el && el.innerText?.trim()) {
                    name = el.innerText.trim();
                    break;
                  }
                }
              }

              if (name) window._updateSpeaker(name);
            } catch (e) {}
          }, 1000);

          console.log("✅ Caption observer active + polling enabled");
        }

        setTimeout(findAndObserveCaptions, 3000);
      });

    } catch (err) {
      console.log("⚠️ Caption enable error:", err.message);
    }
  }

  _startParticipantScraper() {
    // Fix detached frame — check page is open before scraping
    const scrape = async () => {
      try {
        if (!this.page || this.page.isClosed() || !this.isRunning) return;

        const names = await this.page.evaluate(() => {
          const names = [];
          const seen = new Set();
          const rejectList = [
            "microphone", "camera", "settings", "video", "audio", "screen",
            "share", "chat", "caption", "raise hand", "reaction", "panel",
            "call controls", "meeting details", "background", "everyone",
            "notifications", "ai scribe", "meetscribe", "scribe",
          ];

          document.querySelectorAll("[data-self-name]").forEach((el) => {
            const name = el.getAttribute("data-self-name");
            if (name && name.length > 1 && name.length < 40 && !seen.has(name)) {
              const lower = name.toLowerCase();
              if (!rejectList.some((p) => lower.includes(p))) {
                seen.add(name);
                names.push(name);
              }
            }
          });

          return names;
        }).catch(() => []);

        if (names.length > 0) {
          const newJoiners = names.filter((n) => !this.participantNames.includes(n));
          const left = this.participantNames.filter((n) => !names.includes(n));
          if (newJoiners.length > 0) console.log(`🟢 Joined: ${newJoiners.join(", ")}`);
          if (left.length > 0) console.log(`🔴 Left: ${left.join(", ")}`);

          if (JSON.stringify(names.sort()) !== JSON.stringify([...this.participantNames].sort())) {
            this.participantNames = names;
            console.log(`👥 Participants: ${names.join(", ")}`);
          }
        }
      } catch (_) {}
    };

    setTimeout(scrape, 5000);
    const interval = setInterval(() => {
      if (!this.isRunning) { clearInterval(interval); return; }
      scrape();
    }, 3000);

    console.log("✅ Participant scraper started");
  }

  async _connectDeepgram() {
    if (this.keepAlive) clearInterval(this.keepAlive);

    const url =
      "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&diarize=true&interim_results=true&encoding=linear16&sample_rate=16000&endpointing=500&smart_format=true&utterance_end_ms=1000&vad_events=true";

    const connection = new WebSocket(url, {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
    });

    connection.on("open", () => {
      console.log("✅ Deepgram connected");
      // Flush any queued audio immediately
      while (this._audioQueue.length > 0) {
        const chunk = this._audioQueue.shift();
        connection.send(chunk);
        this.chunksSent++;
      }
      if (this.chunksSent > 0) {
        console.log(`📤 Flushed ${this.chunksSent} queued audio chunks`);
      }
      this.keepAlive = setInterval(() => {
        if (connection.readyState === 1) {
          connection.send(Buffer.alloc(3200, 0));
        }
      }, 5000);
    });

    connection.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle VAD (voice activity detection) events
        if (data.type === "UtteranceEnd") {
          console.log("🎤 Utterance ended");
          return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript || !transcript.trim()) return;

        const isFinal = data.is_final;
        const words = data.channel?.alternatives?.[0]?.words || [];

        if (isFinal) {
          let speakerName = null;

          // Priority 1: Use caption-detected speaker name (Google Meet knows real names)
          if (this._currentSpeaker) {
            speakerName = this._currentSpeaker;
          }

          // Priority 2: Use Deepgram diarization speaker index
          // Rebuild mapping each time — don't cache forever
          if (!speakerName && words.length > 0) {
            const dgSpeaker = words[0].speaker ?? 0;

            // Simple consistent mapping: speaker N -> participantNames[N]
            if (this.participantNames.length > 0) {
              speakerName = this.participantNames[dgSpeaker % this.participantNames.length];
            }

            if (!speakerName) {
              speakerName = `Speaker ${dgSpeaker + 1}`;
            }
          }

          if (!speakerName) speakerName = "Speaker 1";

          const entry = {
            id: uuidv4(),
            text: transcript.trim(),
            timestamp: new Date().toISOString(),
            speaker: speakerName,
          };

          this.transcript.push(entry);
          console.log(`📝 [${speakerName}] (caption=${this._currentSpeaker || "none"}):`, entry.text);
          this.emit("transcript-update", { entry, isFinal: true });

          // Clear caption speaker after use so next caption detection can set a new name
          this._currentSpeaker = null;

        } else {
          // Interim results — emit for live display
          this.emit("transcript-update", {
            text: transcript,
            isFinal: false,
            speaker: this._currentSpeaker || "Listening...",
          });
        }
      } catch (e) {
        console.error("❌ Parse error:", e.message);
      }
    });

    connection.on("error", (err) => {
      console.error("❌ Deepgram error:", err.message);
      if (this.keepAlive) clearInterval(this.keepAlive);
    });

    connection.on("close", (code, reason) => {
      console.log(`🔌 Deepgram closed: ${code}`, reason?.toString() || "");
      if (this.keepAlive) clearInterval(this.keepAlive);
      if (this.isRunning) {
        const delay = code === 1011 ? 3000 : 1000; // Longer delay for server errors
        console.log(`🔄 Reconnecting in ${delay}ms... (${this.chunksSent} chunks sent so far)`);
        setTimeout(() => { if (this.isRunning) this._connectDeepgram(); }, delay);
      }
    });

    this.recognizeStream = connection;
  }

  async stop() {
    this.isRunning = false;
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.recognizeStream) {
      try { this.recognizeStream.close(); } catch (_) {}
    }
    if (this.browser) await this.browser.close();
    this.emit("bot-status", { status: "stopped", message: "Bot has left the meeting." });
    return this.transcript;
  }

  getTranscript() {
    return this.transcript;
  }
}

module.exports = MeetBot;