import { google, gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { EmailMetadata } from "../types/email.js";
import { withExponentialBackoff } from "./retry.js";

function decodeBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const body = decodeBody(part);
    if (body) return body;
  }
  return "";
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export class GmailService {
  private readonly gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async getUnreadInboxEmails(maxResults: number): Promise<EmailMetadata[]> {
    const response = await withExponentialBackoff(
      () => this.gmail.users.messages.list({
        userId: "me",
        q: "in:inbox is:unread -in:spam -in:trash",
        maxResults,
      }),
      "Gmail message listing",
    );

    const emails: EmailMetadata[] = [];
    for (const message of response.data.messages ?? []) {
      if (!message.id) continue;
      const messageId = message.id;
      const detail = await withExponentialBackoff(
        () => this.gmail.users.messages.get({ userId: "me", id: messageId, format: "full" }),
        "Gmail message retrieval",
      );
      const headers = detail.data.payload?.headers;
      emails.push({
        id: messageId,
        threadId: message.threadId ?? "",
        from: headerValue(headers, "from") || "Unknown sender",
        subject: headerValue(headers, "subject") || "(no subject)",
        date: headerValue(headers, "date"),
        snippet: detail.data.snippet ?? "",
        body: decodeBody(detail.data.payload).slice(0, 6000),
      });
    }
    return emails;
  }

  async moveEmailToTrash(emailId: string): Promise<void> {
    await withExponentialBackoff(
      () => this.gmail.users.messages.trash({ userId: "me", id: emailId }),
      "Moving Gmail message to Trash",
    );
  }
}