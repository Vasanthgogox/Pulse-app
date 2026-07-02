// Immediate on-upload document verification (Gemini Vision)
//
// Called by the mobile client right after uploadVerificationDocument()/
// uploadAddressProof() succeeds — before the user reaches Submit. Gives
// instant feedback under each upload zone instead of waiting for the
// post-submit async worker (verification-worker/index.ts, which still runs
// the authoritative Claude-based OCR congruence check at submit time).
//
// gst_certificate / pan_card: extract the tax ID and fuzzy-match against
// what the user typed. address_proof_*: no typed value to compare against,
// so this only confirms the document is legible and looks like the
// declared document type.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normaliseTaxId(s: string): string {
  return (s ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function taxIdSimilarity(typed: string, extracted: string): number {
  const a = normaliseTaxId(typed);
  const b = normaliseTaxId(extracted);
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

type DocumentType =
  | 'gst_certificate'
  | 'pan_card'
  | 'address_proof_lease'
  | 'address_proof_utility_bill'
  | 'address_proof_other';

interface VerifyRequest {
  document_type: DocumentType;
  storage_path:  string;   // path in 'verification-documents' private bucket
  typed_gstin?:  string;   // required for gst_certificate
  typed_pan?:    string;   // required for pan_card
}

const HARD_THRESHOLD = 0.85;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const geminiKey       = Deno.env.get('GEMINI_API_KEY')            ?? '';
  const geminiModel     = Deno.env.get('GEMINI_MODEL')              ?? 'gemini-2.5-flash';

  if (!geminiKey) {
    return json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { document_type, storage_path, typed_gstin, typed_pan } = body;
  if (!storage_path)  return json({ error: 'storage_path required' }, 400);
  if (!document_type) return json({ error: 'document_type required' }, 400);

  // ── 1. Fetch signed URL for the private document ──────────────────────────
  const signedUrlRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/verification-documents/${encodeURIComponent(storage_path)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ expiresIn: 120 }),
    },
  );

  if (!signedUrlRes.ok) {
    return json({ error: 'Failed to generate signed URL for document' }, 500);
  }
  const { signedURL } = await signedUrlRes.json() as { signedURL: string };

  // ── 2. Download document bytes ─────────────────────────────────────────────
  const docRes = await fetch(signedURL);
  if (!docRes.ok) return json({ error: 'Failed to download document from storage' }, 500);

  const docBuffer = await docRes.arrayBuffer();
  const docBytes  = new Uint8Array(docBuffer);
  let binary = '';
  for (let i = 0; i < docBytes.length; i++) binary += String.fromCharCode(docBytes[i]);
  const base64Doc = btoa(binary);

  const contentType = docRes.headers.get('content-type') ?? 'image/jpeg';
  const isImage = contentType.startsWith('image/');
  const isPdf   = contentType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ error: `Unsupported document type: ${contentType}` }, 400);
  }

  // ── 3. Call Gemini Vision for field extraction ─────────────────────────────
  const prompt = `Extract the following fields from this Indian business document. Return ONLY a valid JSON object with these exact keys. If a field is not visible, use null.

{
  "gstin": "<15-character GSTIN or null>",
  "pan": "<10-character PAN or null>",
  "document_type": "<'gst_certificate' | 'pan_card' | 'lease_agreement' | 'utility_bill' | 'other' | 'unreadable'>",
  "legible": <true | false>
}

Return ONLY the JSON — no markdown, no explanation.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: contentType, data: base64Doc } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }),
    },
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return json({ error: `Gemini API error: ${errText}` }, 500);
  }

  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  let extracted: {
    gstin: string | null;
    pan: string | null;
    document_type: string | null;
    legible: boolean;
  };

  try {
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const cleaned = rawText.replace(/```json?\n?|\n?```/g, '').trim();
    extracted = JSON.parse(cleaned);
  } catch {
    return json({ error: 'Failed to parse extracted fields from Gemini response' }, 500);
  }

  // ── 4. Evaluate result per document type ───────────────────────────────────
  if (document_type === 'gst_certificate') {
    if (!extracted.legible || !extracted.gstin) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a GSTIN from this document. Please upload a clear photo of your GST certificate.',
        extracted,
      });
    }
    const score = taxIdSimilarity(typed_gstin ?? '', extracted.gstin);
    const passed = score >= HARD_THRESHOLD;
    return json({
      passed,
      route_to_manual: !passed,
      message: passed
        ? 'GST certificate matches the GSTIN you entered.'
        : `The GSTIN on this document (${extracted.gstin}) doesn't match what you entered (${typed_gstin}). Please check and re-upload.`,
      score: Math.round(score * 100),
      extracted,
    });
  }

  if (document_type === 'pan_card') {
    if (!extracted.legible || !extracted.pan) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a PAN from this document. Please upload a clear photo of your PAN card.',
        extracted,
      });
    }
    const score = taxIdSimilarity(typed_pan ?? '', extracted.pan);
    const passed = score >= HARD_THRESHOLD;
    return json({
      passed,
      route_to_manual: !passed,
      message: passed
        ? 'PAN card matches the PAN you entered.'
        : `The PAN on this document (${extracted.pan}) doesn't match what you entered (${typed_pan}). Please check and re-upload.`,
      score: Math.round(score * 100),
      extracted,
    });
  }

  // Address proof: no typed value to compare — just confirm it's legible and
  // recognisable as an address document, not a mismatch check.
  const looksLikeAddressDoc = extracted.document_type === 'lease_agreement'
    || extracted.document_type === 'utility_bill'
    || extracted.document_type === 'other';

  const passed = extracted.legible && looksLikeAddressDoc;
  return json({
    passed,
    route_to_manual: !passed,
    message: passed
      ? 'Document looks readable.'
      : !extracted.legible
      ? 'This document is too blurry or unclear to read. Please upload a clearer photo or scan.'
      : "This doesn't look like an address proof document. Please upload a lease agreement, utility bill, or similar.",
    extracted,
  });
});
