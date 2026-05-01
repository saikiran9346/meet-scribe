# MeetScribe - AI-Powered Meeting Transcription & Summarization

MeetScribe is an intelligent application that automatically joins Google Meet calls, transcribes conversations in real-time, and generates AI-powered summaries with key decisions, action items, and speaker breakdown.

## Features

- 🤖 **Automated Bot**: Joins Google Meet calls automatically
- 🎙️ **Real-time Transcription**: Live transcription using Deepgram AI
- 📝 **AI Summary**: Automatic generation of meeting summaries using Groq LLM
- ✅ **Action Items**: Identifies tasks, owners, and priorities
- 💬 **Meeting Chatbot**: Ask questions about past meetings
- 📊 **Sentiment Analysis**: Understand meeting tone and sentiment
- 🔍 **Searchable History**: Browse and search past meetings

## Prerequisites

- Node.js (v16 or higher)
- Google Cloud Platform account with:
  - Service account credentials
  - Cloud Storage bucket
  - Firestore database
- API Keys:
  - Deepgram API key
  - Groq API key
- Google Chrome browser
- Separate Google account for the bot

## Project Structure

```
meet-scribe/
├── backend/                 # Node.js backend
│   ├── bot/
│   │   └── meetBot.js      # Puppeteer-based Meet bot
│   ├── services/
│   │   ├── langchainService.js  # AI summarization & chat
│   │   └── storageService.js    # GCP Cloud Storage
│   ├── middleware/
│   │   └── auth.js         # Firebase authentication
│   ├── routes/
│   │   └── api.js          # API endpoints
│   ├── server.js           # Express server
│   └── .env                # Environment variables
├── frontend/               # React frontend
│   └── src/
│       ├── components/     # React components
│       ├── pages/          # Page components
│       ├── context/        # Auth context
│       └── hooks/          # Custom hooks
├── .env.example           # Environment template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd meet-scribe

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Go back to root
cd ..
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your actual values:
# - GCP_CLIENT_EMAIL
# - GCP_PRIVATE_KEY
# - GCP_BUCKET_NAME
# - DEEPGRAM_API_KEY
# - GROQ_API_KEY
# - CHROME_PROFILE_PATH
# - CHROME_EXECUTABLE_PATH
```

### 3. Bot Chrome Profile Setup

**Important**: The bot uses a persistent Chrome profile to avoid login prompts.

```bash
# Create a dedicated Chrome profile directory for the bot
# Windows: C:\Users\YourUsername\AppData\Local\Google\Chrome\User Data\BotProfile
# macOS: ~/Library/Application Support/Google/Chrome/BotProfile
# Linux: ~/.config/google-chrome/BotProfile

# Launch Chrome with the bot profile and sign in manually ONCE:
# Windows:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\Users\YourUsername\AppData\Local\Google\Chrome\User Data\BotProfile"

# macOS:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --user-data-dir="~/Library/Application Support/Google/Chrome/BotProfile"

# Linux:
google-chrome --user-data-dir="~/.config/google-chrome/BotProfile"
```

**One-time setup steps:**
1. Open Chrome with the bot profile path
2. Sign in with the Google account you want to use for the bot
3. Close Chrome (session will be saved)
4. The bot will reuse this session automatically

### 4. Start the Application

```bash
# Terminal 1: Start Backend
cd backend
npm start
# Backend runs on http://localhost:8080

# Terminal 2: Start Frontend
cd frontend
npm start
# Frontend runs on http://localhost:3000
```

## Usage Workflow

### Starting a Meeting Session

1. **Login**: Sign in with your Google account
2. **Dashboard**: Navigate to the main dashboard
3. **Start Session**:
   - Paste a Google Meet link (e.g., `https://meet.google.com/abc-defg-hij`)
   - Click "Deploy Bot"
   - You'll be redirected to the session page

### During the Meeting

- The bot will:
  1. Launch Chrome with the saved profile (already logged in)
  2. Navigate to the meeting automatically
  3. Turn off mic/camera
  4. Click "Join now" or wait for "Ask to join"
  5. Start transcribing once in the meeting

- **Live Transcript**: Watch real-time transcription on the session page
- **Status Updates**: Monitor bot status (launching → joining → listening)
- **No Login Required**: The bot uses your pre-configured Chrome profile

### Stopping & Getting Summary

1. Click "Stop & Summarize" button
2. The bot will:
   - Leave the meeting
   - Generate AI summary with key decisions, action items
   - Save transcript and summary to cloud storage
3. You'll be redirected to the summary page

### Summary Page Features

- **Overview**: Meeting title, overview, and sentiment
- **Decisions**: Key decisions made during the meeting
- **Actions**: Action items with owners and priorities
- **Speakers**: Breakdown by speaker
- **Transcript**: Full meeting transcript
- **Chat AI**: Ask questions about the meeting

### Viewing Past Meetings

1. Go to Dashboard
2. Click on any past meeting in the history list
3. View full summary and transcript
4. Use the Chat AI to ask specific questions

## API Endpoints

### Bot Control
- `POST /api/bot/start` - Start bot in a meeting
- `POST /api/bot/stop` - Stop bot and generate summary
- `GET /api/bot/transcript/:sessionId` - Get live transcript

### Meetings
- `GET /api/meetings` - List all meetings for user
- `GET /api/meetings/:sessionId` - Get full meeting data
- `DELETE /api/meetings/:sessionId` - Delete a meeting

### Chat
- `POST /api/meetings/:sessionId/chat` - Send message to meeting chatbot
- `GET /api/meetings/:sessionId/chat` - Get chat history

### Sharing
- `POST /api/meetings/:sessionId/share` - Generate share link
- `GET /api/meetings/:sessionId/pdf` - Get PDF download link

## Technical Architecture

### Backend Technologies
- **Express.js**: Web server framework
- **Socket.IO**: Real-time communication
- **Puppeteer**: Browser automation for Google Meet
- **Deepgram**: Real-time speech-to-text
- **Groq/LLaMA**: AI summarization and chat
- **Firebase Admin**: Authentication and Firestore
- **Google Cloud Storage**: Meeting data storage

### Frontend Technologies
- **React**: UI framework
- **React Router**: Client-side routing
- **Socket.IO Client**: Real-time updates
- **Firebase Auth**: User authentication

## How It Works

### Audio Capture Flow
1. Bot joins Google Meet as "AI Scribe"
2. Captures audio streams from `<audio>` elements
3. Converts audio to PCM16 format (16kHz sample rate)
4. Sends audio chunks to Deepgram via WebSocket
5. Deepgram returns real-time transcriptions
6. Transcriptions are emitted to frontend via Socket.IO

### AI Summarization Flow
1. When bot stops, full transcript is collected
2. Transcript is sent to Groq/LLaMA model
3. Model generates structured JSON with:
   - Meeting title and overview
   - Key decisions
   - Action items with owners
   - Speaker breakdown
   - Sentiment analysis
4. Summary and transcript are saved to GCP Storage
5. Meeting metadata is saved to Firestore

### Chat System
1. Chat sessions are initialized with meeting context
2. System prompt includes full transcript and summary
3. Conversation history is maintained in memory
4. Each query invokes the LLM with conversation context
5. Responses are streamed back to the user

## Troubleshooting

### Bot Can't Join Meeting
- Ensure the meeting is active and allows participants to join
- Check that bot credentials are correct in `.env`
- Verify the meeting URL is valid

### No Transcription
- Ensure participants have microphones unmuted
- Check Deepgram API key is valid
- Verify bot audio capture is working (check backend logs)

### Authentication Errors
- Ensure Firebase service account is properly configured
- Verify Firebase rules allow read/write access
- Check user is properly authenticated

### Storage Errors
- Verify GCP service account has Storage Admin permissions
- Check bucket name is correct
- Ensure service account JSON is valid

## Important Notes

- **Bot Admission**: The bot must be admitted to the meeting by a host
- **Audio Quality**: Transcription quality depends on audio clarity
- **Rate Limits**: Be mindful of API rate limits (Deepgram, Groq)
- **Security**: Never commit `.env` or `serviceAccount.json` to version control
- **Headless Mode**: Bot runs in non-headless mode for better compatibility

## Future Enhancements

- [ ] PDF export functionality
- [ ] Meeting scheduling
- [ ] Multiple bot instances
- [ ] Custom vocabulary support
- [ ] Multi-language support
- [ ] Meeting analytics dashboard
- [ ] Integration with calendar apps

## License

Private project - All rights reserved

## Support

For issues or questions, check the backend logs and frontend console for error messages.
