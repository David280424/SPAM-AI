# Gmail + Gemini Inbox Cleaner

Classifies unread inbox mail with Gemini and proposes cleanup actions. It does not change Gmail by default.

## Setup

Requirements: Node.js 20 or newer, Gmail API enabled in a Google Cloud project, an OAuth Desktop app `credentials.json`, and a Gemini API key.

```powershell
npm install
Copy-Item .env.example .env
```

Set `GEMINI_API_KEY` in `.env`. Keep `DRY_RUN=true` for review. The first run prints a Google authorization URL and saves the token locally after consent.

## Run

```powershell
npm run dev
npm run build
```

To reclassify messages instead of reusing the local analysis cache, run `npm run dev -- --refresh`.

To move qualifying messages to Trash, set `DRY_RUN=false` in `.env`, inspect the results in a dry run first, then run:

```powershell
npm run dev -- --apply
```

Only messages Gemini marks as unwanted, recommends for Trash, and scores at or above `MIN_CONFIDENCE_TO_TRASH` are moved. Trash is the only implemented Gmail mutation. Review classifications before applying them.

`credentials.json`, `.env`, `token.json`, and `analysis-cache.json` are local files; do not commit them. Email content is sent to the Gemini API for classification.