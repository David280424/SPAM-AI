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

## Use Spam AI inside Gmail

The `gmail-addon` folder contains a Gmail contextual add-on. It adds an **Analyze this email** button when you open a message. The add-on only offers **Move to Trash** when Gemini marks the message as unwanted, recommends `TRASH`, and meets the confidence threshold. Nothing is changed until you click that button. To limit latency and API usage, it defaults to Gemini 3.5 Flash-Lite, sends at most 2,000 characters of the email body, limits response length, and caches each successful analysis for up to six hours per user. Reopening and analyzing the same message during that period reuses the result instead of calling Gemini again. Set `GEMINI_MODEL` in Apps Script properties only if you want to override the default.

To install it for your own Gmail account:

1. Create a project at [script.google.com](https://script.google.com/) and copy `gmail-addon/Code.gs` into its script file.
2. In Apps Script, open **Project Settings** and enable **Show "appsscript.json" manifest file in editor**. Replace the manifest with `gmail-addon/appsscript.json`.
3. In **Project Settings > Script Properties**, add `GEMINI_API_KEY` with your Gemini API key. Optionally add `GEMINI_MODEL` to override the default (`gemini-3.5-flash-lite`) and `MIN_CONFIDENCE_TO_TRASH` (defaults to `0.9`, valid range `0` to `1`). Keep the Apps Script project private; editors can access its script properties.
4. In **Deploy > Test deployments**, choose **Install** for Gmail and authorize the requested current-message and external-request access.
5. Open a message in Gmail and select the Spam AI add-on from the side panel. Analyze first; choose **Move to Trash** only if you want to remove that message.

Email content is sent to the Gemini API for classification. This add-on is separate from the command-line tool and does not require its OAuth credentials or local token file.