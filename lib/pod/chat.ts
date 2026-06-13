import { GoogleGenAI, type Content } from '@google/genai';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const TIMEOUT_MS = 60_000;

const MODELS = {
  default: 'gemini-2.5-flash',
  fallback: 'gemini-2.5-flash-lite',
};

let genAIClient: GoogleGenAI | null = null;
function getGenAIClient() {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env.');
  }
  if (!genAIClient) genAIClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return genAIClient;
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
  const base64Data = arrayBufferToBase64(fileBuffer);
  
  // The first message needs to contain the document attachment
  const documentPart = { inlineData: { data: base64Data, mimeType } } as any;

  const systemInstruction = `You are a highly advanced digital audit assistant ("POD AI").
You are analyzing a proof-of-delivery (POD), LSR copy, invoice, or logistics document.
Be highly precise. If asked about quantities, damage, or specific text on the document, look carefully.
Extract exact phrasing or numbers. Point out if a document is blurry or illegible.
Specifically check for loading and unloading in/out times, loading/unloading costs, BPIL data, LSCR copies (e.g. drums received vs damaged/short), and Goods Inspection Reports.
Keep responses concise, crisp, and professional. Use formatting like bolding or bullet points for readability.`;

  // Build the conversation history
  const contents: Content[] = [];
  
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
        parts: [{ text: msg.content } as any],
      } as any);
    }
    // Add the new message
    contents.push({
      role: 'user',
      parts: [documentPart, { text: newMessage } as any],
    } as any);
  } else {
    // First message ever
    contents.push({
      role: 'user',
      parts: [...currentTurnParts, { text: newMessage } as any],
    } as any);
  }

  const config = {
    temperature: 0.2, // Slightly creative but mostly deterministic
    topK: 40,
  } as any;

  try {
    const result: any = await Promise.race([
      getGenAIClient().models.generateContent({
        model: MODELS.default,
        contents,
        config,
      }),
      timeoutPromise(TIMEOUT_MS),
    ]);
    
    const text = result.text ?? '';
    if (!text) throw new Error('Empty response from AI model');
    return text;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[Chat API Error]", msg);
    
    // Attempt fallback if timeout or quota
    if (msg.includes('timeout') || msg.includes('429') || msg.includes('exhausted')) {
        console.log("Attempting fallback model...");
        try {
            const fallbackResult: any = await getGenAIClient().models.generateContent({
              model: MODELS.fallback,
              contents,
              config,
            });
            return fallbackResult.text || "I couldn't generate a response. Please try again.";
        } catch (fallbackErr) {
            console.error("[Chat Fallback Error]", fallbackErr);
            throw new Error("AI Terminal is currently overloaded. Please wait a moment and try again.");
        }
    }
    
    throw new Error(msg);
  }
}
