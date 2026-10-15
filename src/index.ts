import { config } from "./config/env.js";
import { authenticateOAuth } from "./services/auth.service.js";
import { loadAnalysisCache, saveAnalysisCache } from "./services/analysis-cache.service.js";
import { GeminiService } from "./services/gemini.service.js";
import { GmailService } from "./services/gmail.service.js";

async function run(): Promise<void> {
  const applyRequested = process.argv.includes("--apply");
  const refreshCache = process.argv.includes("--refresh");
  const applyChanges = applyRequested && !config.dryRun;

  console.log(`Inbox scan: ${applyChanges ? "APPLY MODE" : "DRY RUN (no Gmail changes)"}`);
  if (applyRequested && config.dryRun) {
    console.warn("--apply was ignored because DRY_RUN is true. Set DRY_RUN=false to enable changes.");
  }

  const auth = await authenticateOAuth();
  const gmail = new GmailService(auth);
  const gemini = new GeminiService(config.geminiApiKey, config.geminiModel);
  const emails = await gmail.getUnreadInboxEmails(config.maxEmails);
  const cache = refreshCache ? {} : await loadAnalysisCache();
  console.log(`Unread inbox messages found: ${emails.length}`);

  const uncachedEmails = emails.filter((email) => !cache[email.id]);
  const uncachedIds = new Set(uncachedEmails.map((email) => email.id));
  if (uncachedEmails.length > 0) {
    console.log(`Classifying ${uncachedEmails.length} uncached messages in one Gemini request...`);
    Object.assign(cache, await gemini.analyzeEmails(uncachedEmails));
    await saveAnalysisCache(cache);
  }

  for (const email of emails) {
    const analysis = cache[email.id];
    if (!uncachedIds.has(email.id)) {
      console.log("Using cached classification.");
    }

    console.log("\n----------------------------------------");
    console.log(`${email.subject} | ${email.from}`);
    console.log(`${analysis.category} | unwanted=${analysis.isSpamOrUnwanted} | confidence=${analysis.confidenceScore.toFixed(2)}`);
    console.log(`Summary: ${analysis.summary}`);
    console.log(`Suggested action: ${analysis.suggestedAction}`);

    const approvedForTrash =
      applyChanges &&
      analysis.isSpamOrUnwanted &&
      analysis.suggestedAction === "TRASH" &&
      analysis.confidenceScore >= config.minConfidenceToTrash;

    if (approvedForTrash) {
      await gmail.moveEmailToTrash(email.id);
      console.log("Moved to Trash.");
    } else if (analysis.suggestedAction === "TRASH" && analysis.isSpamOrUnwanted) {
      console.log("Not changed. Review the result; apply requires DRY_RUN=false, --apply, and the confidence threshold.");
    }
  }
}

run().catch((error: unknown) => {
  console.error("Inbox cleanup failed:", error);
  process.exitCode = 1;
});