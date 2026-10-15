export const EMAIL_CATEGORIES = [
  "SPAM",
  "PROMOTIONAL",
  "NEWSLETTER",
  "IMPORTANT",
  "PERSONAL",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export type SuggestedAction = "TRASH" | "MARK_SPAM" | "ARCHIVE" | "KEEP";

export interface EmailMetadata {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export interface EmailAnalysisResult {
  emailId: string;
  category: EmailCategory;
  isSpamOrUnwanted: boolean;
  confidenceScore: number;
  reasoning: string;
  summary: string;
  suggestedAction: SuggestedAction;
}