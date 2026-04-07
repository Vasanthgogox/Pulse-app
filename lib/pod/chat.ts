import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const TIMEOUT_MS = 60_000;

const MODELS = {
  default: 'gemini-2.0-flash',
  fallback: 'gemini-1.5-flash',
};

let genAIClient: GoogleGenerativeAI | null = null;
function getGenAIClient() {
  if (!genAIClient) genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAIClient;
}

const modelCache = new Map();
function getModel(modelName: string) {
  if (!modelCache.has(modelName)) modelCache.set(modelName, getGenAIClient().getGenerativeModel({ model: modelName }));
  return modelCache.get(modelName);
}

function timeoutPromise(ms: number) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('AI response timeout')), ms));
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithDocument(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  history: ChatMessage[],
  newMessage: string
): Promise<string> {
  const model = getModel(MODELS.default);
  const base64Data = arrayBufferToBase64(fileBuffer);
  
  // The first message needs to contain the document attachment
  const documentPart = { inlineData: { data: base64Data, mimeType } };

  const systemInstruction = `You are a highly advanced digital audit assistant ("POD AI").
You are analyzing a proof-of-delivery (POD), LSR copy, invoice, or logistics document.
Be highly precise. If asked about quantities, damage, or specific text on the document, look carefully.
Extract exact phrasing or numbers. Point out if a document is blurry or illegible.
Specifically check for loading and unloading in/out times, loading/unloading costs, BPIL data, LSCR copies (e.g. drums received vs damaged/short), and Goods Inspection Reports.
Keep responses concise, crisp, and professional. Use formatting like bolding or bullet points for readability.`;

  // Build the conversation history
  const contents: any[] = [];
  
  // Add the current interaction context
  const currentTurnParts: any[] = [
    { text: systemInstruction },
    documentPart
  ];

  // If there is history, we construct the proper turn sequence
  if (history.length > 0) {
    // Add all historical messages
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
    // Add the new message
    contents.push({
      role: 'user',
      parts: [documentPart, { text: newMessage }]
    });
  } else {
    // First message ever
    contents.push({
      role: 'user',
      parts: [...currentTurnParts, { text: newMessage }]
    });
  }

  const request = {
    contents,
    generationConfig: {
      temperature: 0.2, // Slightly creative but mostly deterministic
      topK: 40,
    },
  };

  try {
    const result: any = await Promise.race([
      model.generateContent(request),
      timeoutPromise(TIMEOUT_MS),
    ]);
    
    const text = result.response?.text();
    if (!text) throw new Error('Empty response from AI model');
    return text;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[Chat API Error]", msg);
    
    // Attempt fallback if timeout or quota
    if (msg.includes('timeout') || msg.includes('429') || msg.includes('exhausted')) {
        console.log("Attempting fallback model...");
        try {
            const fallbackModel = getModel(MODELS.fallback);
            const fallbackResult: any = await fallbackModel.generateContent(request);
            return fallbackResult.response?.text() || "I couldn't generate a response. Please try again.";
        } catch (fallbackErr) {
            console.error("[Chat Fallback Error]", fallbackErr);
            throw new Error("AI Terminal is currently overloaded. Please wait a moment and try again.");
        }
    }
    
    throw new Error(msg);
  }
}
