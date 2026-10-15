import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { EmailAnalysisResult } from "../types/email.js";
import { EMAIL_CATEGORIES } from "../types/email.js";

const cacheSchema = z.record(z.object({
  emailId: z.string(),
  category: z.enum(EMAIL_CATEGORIES),
  isSpamOrUnwanted: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
  reasoning: z.string(),
  summary: z.string(),
  suggestedAction: z.enum(["TRASH", "MARK_SPAM", "ARCHIVE", "KEEP"]),
}));

const cachePath = path.resolve("analysis-cache.json");

export async function loadAnalysisCache(): Promise<Record<string, EmailAnalysisResult>> {
  try {
    return cacheSchema.parse(JSON.parse(await readFile(cachePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("analysis-cache.json is invalid; remove it or repair it before continuing.", { cause: error });
  }
}

export async function saveAnalysisCache(cache: Record<string, EmailAnalysisResult>): Promise<void> {
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}