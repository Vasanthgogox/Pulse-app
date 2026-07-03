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

  try {
    return await handle(req);
  } catch (e) {
    return json({ error: `Unhandled error: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
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
  // Storage's /sign endpoint requires `apikey` alongside `Authorization` when
  // the project uses the new sb_secret_/sb_publishable_ key format — Bearer
  // alone returns "Invalid Compact JWS" since sb_secret_ keys aren't JWTs.
  // Encode each path segment separately — encoding the whole path (with `/`
  // as %2F) bakes the wrong path into the signed token, so the storage
  // backend later rejects the download with "InvalidSignature".
  const encodedStoragePath = storage_path.split('/').map(encodeURIComponent).join('/');
  const signedUrlRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/verification-documents/${encodedStoragePath}`,
    {
      method: 'POST',
      headers: {
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ expiresIn: 120 }),
    },
  );

  if (!signedUrlRes.ok) {
    const errText = await signedUrlRes.text();
    return json({ error: `Failed to generate signed URL for document: ${errText}` }, 500);
  }
  const { signedURL } = await signedUrlRes.json() as { signedURL: string };
  // signedURL from Storage's /sign endpoint is relative (e.g. "/object/sign/...")
  // — fetch() requires an absolute URL, so prefix with the storage base.
  const absoluteSignedUrl = signedURL.startsWith('http')
    ? signedURL
    : `${supabaseUrl}/storage/v1${signedURL}`;

  // ── 2. Download document bytes ─────────────────────────────────────────────
  const docRes = await fetch(absoluteSignedUrl);
  if (!docRes.ok) {
    const errText = await docRes.text();
    return json({ error: `Failed to download document from storage: ${docRes.status} ${errText} url=${absoluteSignedUrl}` }, 500);
  }

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
  const prompt = `Extract the following fields from this Indian document. Return ONLY a valid JSON object with these exact keys. If a field is not visible, use null.

{
  "gstin": "<15-character GSTIN or null>",
  "pan": "<10-character PAN or null>",
  "document_type": "<'gst_certificate' | 'pan_card' | 'lease_agreement' | 'utility_bill' | 'aadhaar_card' | 'voter_id' | 'other' | 'unreadable'>",
  "legible": <true | false>
}

Only set "gstin" if this document is a GST registration certificate (has a
GSTIN, legal/trade name, and GST registry letterhead). Only set "pan" if this
document is an actual PAN card. Do not extract a gstin or pan value from any
other document type (Aadhaar, voter ID, driving licence, etc.) even if it
contains a similarly-shaped number.

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
        generationConfig: {
          temperature: 0,
          // gemini-2.5-flash spends part of maxOutputTokens on internal
          // "thinking" before writing the visible response — with a low
          // budget the model can exhaust it mid-JSON, producing truncated
          // output like `{"gstin":` with nothing after it. Disable thinking
          // (not needed for a straight extraction task) and give the
          // visible output a generous ceiling.
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
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

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    // Gemini sometimes prefixes/suffixes the JSON with prose despite
    // instructions ("Here's the data:\n\n{...}\n\nLet me know if..."), which
    // fails a strict whole-string parse even though valid JSON is present.
    // Strip markdown fences, then extract the first {...} block rather than
    // requiring the entire response to be clean JSON.
    const withoutFences = rawText.replace(/```json?\n?|\n?```/g, '').trim();
    const jsonMatch = withoutFences.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    extracted = JSON.parse(jsonMatch[0]);
  } catch {
    // Gemini returned something we still couldn't salvage a JSON object
    // from — most likely a safety refusal or plain-language explanation
    // instead of the requested JSON (seen on sensitive ID documents like
    // Aadhaar). Treat as "could not verify", not a transport error — a 500
    // here gets swallowed by the client as a pass-through, which would
    // silently accept an unverified document. Surface the raw text in the
    // response itself (get_logs doesn't expose console output from this
    // environment) so it's visible in the client console during triage.
    console.error('[gemini-doc-verify] unparseable response:', rawText);
    return json({
      passed: false, route_to_manual: true,
      message: 'Could not verify this document right now. Please try again.',
      extracted: { gstin: null, pan: null, document_type: null, legible: false },
      debug_raw_gemini_text: rawText,
    });
  }

  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const PAN_REGEX   = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  // ── 4. Evaluate result per document type ───────────────────────────────────
  // Empty typed value means the field hasn't been filled yet — client
  // auto-fills it from `extracted` instead of comparing. Still requires the
  // extracted value to match the real GSTIN/PAN format before trusting it.
  if (document_type === 'gst_certificate') {
    if (!extracted.legible) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a GSTIN from this document. Please upload a clear photo of your GST certificate.',
        extracted,
      });
    }
    // Check the document's own classification before checking for a
    // missing GSTIN — a PAN card/Aadhaar with no GSTIN should say "wrong
    // document", not the more generic "could not read a GSTIN".
    if (extracted.document_type !== 'gst_certificate') {
      return json({
        passed: false, route_to_manual: true,
        message: 'This doesn\'t look like a GST certificate. Please upload the correct document.',
        extracted,
      });
    }
    if (!extracted.gstin) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a GSTIN from this document. Please upload a clear photo of your GST certificate.',
        extracted,
      });
    }
    const extractedGstin = extracted.gstin.toUpperCase().replace(/\s/g, '');
    if (!GSTIN_REGEX.test(extractedGstin)) {
      return json({
        passed: false, route_to_manual: true,
        message: `Extracted text (${extractedGstin}) doesn't look like a valid GSTIN. Please upload a clearer photo.`,
        extracted,
      });
    }
    if (!typed_gstin?.trim()) {
      return json({
        passed: true, route_to_manual: false,
        message: `Read GSTIN ${extractedGstin} from this document.`,
        extracted: { ...extracted, gstin: extractedGstin },
      });
    }
    const score = taxIdSimilarity(typed_gstin, extractedGstin);
    const passed = score >= HARD_THRESHOLD;
    return json({
      passed,
      route_to_manual: !passed,
      message: passed
        ? 'GST certificate matches the GSTIN you entered.'
        : `The GSTIN on this document (${extractedGstin}) doesn't match what you entered (${typed_gstin}). Please check and re-upload.`,
      score: Math.round(score * 100),
      extracted: { ...extracted, gstin: extractedGstin },
    });
  }

  if (document_type === 'pan_card') {
    if (!extracted.legible) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a PAN from this document. Please upload a clear photo of your PAN card.',
        extracted,
      });
    }
    // Check the document's own classification before checking for a
    // missing PAN — a GST cert/Aadhaar with no PAN should say "wrong
    // document", not the more generic "could not read a PAN".
    if (extracted.document_type !== 'pan_card') {
      return json({
        passed: false, route_to_manual: true,
        message: 'This doesn\'t look like a PAN card. Please upload the correct document.',
        extracted,
      });
    }
    if (!extracted.pan) {
      return json({
        passed: false, route_to_manual: true,
        message: 'Could not read a PAN from this document. Please upload a clear photo of your PAN card.',
        extracted,
      });
    }
    const extractedPan = extracted.pan.toUpperCase().replace(/\s/g, '');
    if (!PAN_REGEX.test(extractedPan)) {
      return json({
        passed: false, route_to_manual: true,
        message: `Extracted text (${extractedPan}) doesn't look like a valid PAN. Please upload a clearer photo.`,
        extracted,
      });
    }
    if (!typed_pan?.trim()) {
      return json({
        passed: true, route_to_manual: false,
        message: `Read PAN ${extractedPan} from this document.`,
        extracted: { ...extracted, pan: extractedPan },
      });
    }
    const score = taxIdSimilarity(typed_pan, extractedPan);
    const passed = score >= HARD_THRESHOLD;
    return json({
      passed,
      route_to_manual: !passed,
      message: passed
        ? 'PAN card matches the PAN you entered.'
        : `The PAN on this document (${extractedPan}) doesn't match what you entered (${typed_pan}). Please check and re-upload.`,
      score: Math.round(score * 100),
      extracted: { ...extracted, pan: extractedPan },
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
}
