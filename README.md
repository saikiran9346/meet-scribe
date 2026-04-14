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
  - Service account credentials (`serviceAccount.json`)
  - Cloud Storage bucket
  - Firestore database
- API Keys:
  - Deepgram API key
  - Groq API key
- Google account for the bot (email + password)

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
│   └── serviceAccount.json # GCP credentials
└── frontend/               # React frontend
    └── src/
        ├── components/     # React components
        ├── pages/          # Page components
        ├── context/        # Auth context
        └── hooks/          # Custom hooks
```

## Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
# Edit .env file with your credentials:
# - GCP_CLIENT_EMAIL
# - GCP_PRIVATE_KEY
# - GCP_BUCKET_NAME
# - DEEPGRAM_API_KEY
# - GROQ_API_KEY
# - BOT_EMAIL
# - BOT_PASSWORD

# Start the server
npm start
# or for development with auto-reload:
npm run dev
```

The backend will start on `http://localhost:8080`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
# Edit .env file with your Firebase config

# Start the development server
npm start
```

The frontend will start on `http://localhost:3000`

## Usage Workflow

### Starting a Meeting Session

1. **Login**: Sign in with your Google account or email/password
2. **Dashboard**: Navigate to the main dashboard
3. **Start Session**: 
   - Paste a Google Meet link (e.g., `https://meet.google.com/abc-defg-hij`)
   - Click "Deploy Bot"
   - You'll be redirected to the session page

### During the Meeting

- The bot will:
  1. Sign in to Google automatically
  2. Navigate to the meeting
  3. Wait to be admitted by the host
  4. Start transcribing once admitted
  
- **Live Transcript**: Watch real-time transcription on the session page
- **Status Updates**: Monitor bot status (launching → joining → listening)

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
