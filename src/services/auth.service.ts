import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config/env.js";

interface DesktopCredentials {
  installed?: {
    client_id: string;
    client_secret: string;
    auth_uri: string;
    token_uri: string;
  };
}

async function saveTokens(tokens: OAuth2Client["credentials"]): Promise<void> {
  await writeFile(config.tokenPath, JSON.stringify(tokens, null, 2), "utf8");
}

export async function authenticateOAuth(): Promise<OAuth2Client> {
  const rawCredentials = await readFile(config.credentialsPath, "utf8");
  const credentials = JSON.parse(rawCredentials) as DesktopCredentials;
  const installed = credentials.installed;
  if (!installed) {
    throw new Error("credentials.json must contain an OAuth Desktop app under 'installed'.");
  }

  const auth = new OAuth2Client(installed.client_id, installed.client_secret);
  try {
    const savedTokens = JSON.parse(await readFile(config.tokenPath, "utf8")) as OAuth2Client["credentials"];
    auth.setCredentials(savedTokens);
    auth.on("tokens", (tokens) => {
      void saveTokens({ ...auth.credentials, ...tokens }).catch((error: unknown) => {
        console.error("Could not persist refreshed OAuth tokens:", error);
      });
    });
    return auth;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const state = randomBytes(24).toString("hex");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start OAuth callback server.");

  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const authorizationUrl = auth.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.modify"],
    state,
    redirect_uri: redirectUri,
  });

  console.log("Open this URL and authorize Gmail access:");
  console.log(authorizationUrl);

  try {
    const code = await new Promise<string>((resolve, reject) => {
      server.on("request", (request, response) => {
        const requestUrl = new URL(request.url ?? "/", redirectUri);
        if (requestUrl.pathname !== "/oauth2callback") {
          response.writeHead(404).end("Not found");
          return;
        }
        if (requestUrl.searchParams.get("state") !== state) {
          response.writeHead(400).end("OAuth state did not match");
          reject(new Error("OAuth state did not match."));
          return;
        }
        const authorizationError = requestUrl.searchParams.get("error");
        const authorizationCode = requestUrl.searchParams.get("code");
        if (authorizationError || !authorizationCode) {
          response.writeHead(400).end("Authorization was not completed. You can close this tab.");
          reject(new Error(`Gmail authorization failed: ${authorizationError ?? "missing authorization code"}`));
          return;
        }
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        response.end("Gmail authorization complete. You can close this tab.");
        resolve(authorizationCode);
      });
    });

    const { tokens } = await auth.getToken({ code, redirect_uri: redirectUri });
    auth.setCredentials(tokens);
    await saveTokens(tokens);
    auth.on("tokens", (updatedTokens) => {
      void saveTokens({ ...auth.credentials, ...updatedTokens }).catch((error: unknown) => {
        console.error("Could not persist refreshed OAuth tokens:", error);
      });
    });
    return auth;
  } finally {
    server.close();
  }
}