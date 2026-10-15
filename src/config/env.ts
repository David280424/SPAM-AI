import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "Set GEMINI_API_KEY in .env"),
  GMAIL_CREDENTIALS_PATH: z.string().default("./credentials.json"),
  GMAIL_TOKEN_PATH: z.string().default("./token.json"),
  DRY_RUN: z.enum(["true", "false"]).default("true"),
  MAX_EMAILS_PER_RUN: z.coerce.number().int().min(1).max(100).default(20),
  MIN_CONFIDENCE_TO_TRASH: z.coerce.number().min(0).max(1).default(0.9),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
});

const parsed = envSchema.parse(process.env);

export const config = {
  geminiApiKey: parsed.GEMINI_API_KEY,
  credentialsPath: path.resolve(parsed.GMAIL_CREDENTIALS_PATH),
  tokenPath: path.resolve(parsed.GMAIL_TOKEN_PATH),
  dryRun: parsed.DRY_RUN === "true",
  maxEmails: parsed.MAX_EMAILS_PER_RUN,
  minConfidenceToTrash: parsed.MIN_CONFIDENCE_TO_TRASH,
  geminiModel: parsed.GEMINI_MODEL,
};