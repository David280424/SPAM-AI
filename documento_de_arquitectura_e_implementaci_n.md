# Especificación Técnica: Limpiador y Administrador Inteligente de Spam para Gmail usando Gemini API

Este documento contiene la arquitectura, flujo de trabajo, buenas prácticas e implementación paso a paso para construir un servicio en Node.js/TypeScript (o Python) que interactúe con la API de Gmail y Google GenAI (Google AI Studio) para clasificar, resumir y gestionar el spam y correos no deseados.

---

## 1. Arquitectura y Flujo de Trabajo

### Componentes Principales
1. **Gmail API Integration**: Autenticación vía OAuth 2.0 para leer unread/inbox emails, aplicar etiquetas (Labels), mover a la papelera/spam y obtener contenido.
2. **Gemini API Integration**: Uso de `@google/genai` (Google AI Studio) con Structured Outputs / JSON Schema para clasificar los correos y obtener un resumen analítico.
3. **Engine / Classifier**: Modulo central que procesa correos por lotes (batching), evalúa las respuestas de Gemini y ejecuta acciones seguras en Gmail (modo dry-run por defecto).
4. **Storage Local / Cache**: Registro de IDs procesados para evitar consumo duplicado de tokens y cuotas de la API.

---

## 2. Requisitos Previos y Configuración de Credenciales

### Google Cloud Console (Gmail API)
1. Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Habilitar **Gmail API**.
3. Configurar la pantalla de consentimiento de OAuth y crear credenciales de tipo **OAuth 2.0 Client ID** (Desktop Application).
4. Descargar `credentials.json` y guardarlo en la raíz del proyecto.

### Google AI Studio (Gemini API Key)
1. Obtener la API Key en [Google AI Studio](https://aistudio.google.com/).
2. Definirla en las variables de entorno como `GEMINI_API_KEY`.

---

## 3. Variables de Entorno (`.env.example`)

```env
GEMINI_API_KEY=tu_api_key_de_google_ai_studio
GMAIL_CREDENTIALS_PATH=./credentials.json
GMAIL_TOKEN_PATH=./token.json
DRY_RUN=true
MAX_EMAILS_PER_RUN=20
```

---

## 4. Implementación del Código Fuente (Node.js + TypeScript)

### Estructura de Directorios Recomendada
```text
src/
├── config/
│   └── env.ts
├── services/
│   ├── gmail.service.ts
│   └── gemini.service.ts
├── types/
│   └── email.ts
└── index.ts
```

### Tipos de Datos (`src/types/email.ts`)

```typescript
export interface EmailMetadata {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export enum EmailCategory {
  SPAM = "SPAM",
  PROMOTIONAL = "PROMOTIONAL",
  NEWSLETTER = "NEWSLETTER",
  IMPORTANT = "IMPORTANT",
  PERSONAL = "PERSONAL"
}

export interface EmailAnalysisResult {
  emailId: string;
  category: EmailCategory;
  isSpamOrUnwanted: boolean;
  confidenceScore: number;
  reasoning: string;
  summary: string;
  suggestedAction: "TRASH" | "MARK_SPAM" | "ARCHIVE" | "KEEP";
}
```

### Servicio Gemini (`src/services/gemini.service.ts`)

```typescript
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { EmailMetadata, EmailAnalysisResult, EmailCategory } from "../types/email";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeEmail(email: EmailMetadata): Promise<EmailAnalysisResult> {
    const prompt = `
Analiza el siguiente correo electrónico y determina si es SPAM, correo no deseado, publicidad masiva o correo legítimo.
Proporciona un resumen breve en español y sugiere la acción a tomar.

Remitente: ${email.from}
Asunto: ${email.subject}
Snippet: ${email.snippet}
Cuerpo parcial: ${email.body.substring(0, 1500)}
`;

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          enum: [
            EmailCategory.SPAM,
            EmailCategory.PROMOTIONAL,
            EmailCategory.NEWSLETTER,
            EmailCategory.IMPORTANT,
            EmailCategory.PERSONAL,
          ],
        },
        isSpamOrUnwanted: { type: Type.BOOLEAN },
        confidenceScore: { type: Type.NUMBER },
        reasoning: { type: Type.STRING },
        summary: { type: Type.STRING },
        suggestedAction: {
          type: Type.STRING,
          enum: ["TRASH", "MARK_SPAM", "ARCHIVE", "KEEP"],
        },
      },
      required: [
        "category",
        "isSpamOrUnwanted",
        "confidenceScore",
        "reasoning",
        "summary",
        "suggestedAction",
      ],
    };

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");

    return {
      emailId: email.id,
      ...parsed,
    };
  }
}
```

### Servicio Gmail (`src/services/gmail.service.ts`)

```typescript
import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";
import { EmailMetadata } from "../types/email";

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  async getUnreadEmails(maxResults = 10): Promise<EmailMetadata[]> {
    const res = await this.gmail.users.messages.list({
      userId: "me",
      q: "is:unread label:INBOX",
      maxResults,
    });

    const messages = res.data.messages || [];
    const emails: EmailMetadata[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const detail = await this.gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload?.headers || [];
      const from = headers.find((h) => h.name === "From")?.value || "Desconocido";
      const subject = headers.find((h) => h.name === "Subject")?.value || "Sin asunto";
      const date = headers.find((h) => h.name === "Date")?.value || "";
      const snippet = detail.data.snippet || "";
      const body = detail.data.snippet || ""; // Para cuerpo completo se extrae el payload.parts

      emails.push({
        id: msg.id,
        threadId: msg.threadId || "",
        from,
        subject,
        date,
        snippet,
        body,
      });
    }

    return emails;
  }

  async moveEmailToTrash(emailId: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: "me",
      id: emailId,
    });
  }

  async applyLabelAndArchive(emailId: string, labelName: string): Promise<void> {
    // Implementar la lógica para crear/obtener etiqueta y mover de la bandeja principal
  }
}
```

### Script Principal de Ejecución (`src/index.ts`)

```typescript
import { GmailService } from "./services/gmail.service";
import { GeminiService } from "./services/gemini.service";
import { authenticateOAuth } from "./services/auth.service"; // Método de autenticación OAuth
import dotenv from "dotenv";

dotenv.config();

async function runSpamCleaner() {
  const isDryRun = process.env.DRY_RUN !== "false";
  console.log(`[Cleaner] Iniciando en modo: ${isDryRun ? "DRY-RUN (Sin cambios)" : "EJECUCIÓN REAL"}`);

  const auth = await authenticateOAuth();
  const gmail = new GmailService(auth);
  const gemini = new GeminiService(process.env.GEMINI_API_KEY!);

  const emails = await gmail.getUnreadEmails(10);
  console.log(`[Cleaner] Correos obtenidos: ${emails.length}`);

  for (const email of emails) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Procesando: "${email.subject}" de <${email.from}>`);
    
    const analysis = await gemini.analyzeEmail(email);

    console.log(`Categoría: ${analysis.category}`);
    console.log(`Es Spam/No deseado: ${analysis.isSpamOrUnwanted}`);
    console.log(`Resumen: ${analysis.summary}`);
    console.log(`Acción recomendada: ${analysis.suggestedAction}`);

    if (analysis.isSpamOrUnwanted && analysis.suggestedAction === "TRASH") {
      if (!isDryRun) {
        await gmail.moveEmailToTrash(email.id);
        console.log(`[ACCIÓN] Correo ${email.id} movido a la papelera.`);
      } else {
        console.log(`[DRY-RUN] Se habría movido a la papelera el correo ${email.id}.`);
      }
    }
  }
}

runSpamCleaner().catch(console.error);
```

---

## 5. Instrucciones para la Agentic AI de VS Code (Ponytail Framework)

Si tu workspace utiliza **Ponytail** (skills, hooks, agents), aplica las siguientes directrices al trabajar en este módulo:

1. **Modularidad**: Manten la separación de responsabilidades entre Autenticación, Servicio de Gmail y Servicio de Gemini.
2. **Defensividad y Seguridad**: Manten `DRY_RUN=true` por defecto durante el desarrollo para prevenir el borrado accidental de correos importantes.
3. **Structured Outputs**: No proceses respuestas de Gemini como texto libre (`string`); fuerza siempre el esquema JSON estricto (`responseSchema`).
4. **Manejo de Rate Limits**: Incluye reintentos con backoff exponencial al llamar tanto a Gmail API como a Gemini API.