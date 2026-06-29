// Async Verification Worker
//
// Triggered every 60s by pg_cron → net.http_post, or directly by the
// mobile client for a manual retry. Processes one job per invocation.
//
// Pipeline per job:
//   1. OCR congruence (cheapest — gate before hitting external registries)
//   2. Pillar 1: GSTIN + PAN registry check (HyperVerge/Signzy abstraction)
//   3. Pillar 2: MCA corporate structure (LLP/Pvt Ltd only)
//
// Pillars 3 (Penny Drop) and 4 (Biometric) require explicit user action and
// are handled by separate endpoints. This worker marks them 'not_started'.
//
// On completion: updates verification_jobs → trigger auto_upgrade_verification_tier
// fires → upgrades organizations.verification_tier if thresholds met.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// ── Registry abstraction ──────────────────────────────────────────────────────
// In production, replace with HyperVerge / Signzy SDK calls.
// These functions return a normalised result regardless of provider.

interface RegistryResult {
  passed:   boolean;
  status:   string;   // 'ACTIVE' | 'INACTIVE' | 'NOT_FOUND' | 'MANUAL_REVIEW'
  detail:   object;
}

async function verifyGstin(gstin: string, supabaseUrl: string, serviceKey: string): Promise<RegistryResult> {
  // Delegate to our existing validate-gstin edge function
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/validate-gstin`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ gstin, declared_company_name: '' }),
    });
    const data = await res.json() as { valid: boolean; status: string; registry_name?: string };
    if (!data.valid) {
      return { passed: false, status: 'INACTIVE', detail: data };
    }
    if (data.status === 'MANUAL_REVIEW') {
      return { passed: false, status: 'MANUAL_REVIEW', detail: data };
    }
    return { passed: true, status: 'ACTIVE', detail: data };
  } catch {
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'GSTIN_REGISTRY_TIMEOUT' } };
  }
}

async function verifyPan(pan: string, hypervergeApiKey: string): Promise<RegistryResult> {
  if (!hypervergeApiKey) {
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'PAN_REGISTRY_NOT_CONFIGURED' } };
  }

  try {
    // HyperVerge PAN verification endpoint
    const res = await fetch('https://ind.idv.hyperverge.co/v1/pan-basic', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'appId':         Deno.env.get('HYPERVERGE_APP_ID') ?? '',
        'appKey':        hypervergeApiKey,
        'transactionId': crypto.randomUUID(),
      },
      body: JSON.stringify({ id: pan }),
    });

    if (!res.ok) {
      return { passed: false, status: 'MANUAL_REVIEW', detail: { http_status: res.status } };
    }

    const data = await res.json() as { status: string; result?: { details?: { status?: string } } };
    const panStatus = data.result?.details?.status ?? '';
    const active = panStatus.toLowerCase().includes('active') || panStatus.toLowerCase().includes('existing');

    return {
      passed: active,
      status: active ? 'ACTIVE' : 'INACTIVE',
      detail: { pan_status: panStatus },
    };
  } catch {
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'PAN_REGISTRY_TIMEOUT' } };
  }
}

async function verifyMCA(
  orgName: string,
  cin: string | null,
  pan: string,
  hypervergeApiKey: string,
): Promise<RegistryResult> {
  if (!hypervergeApiKey) {
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'MCA_NOT_CONFIGURED' } };
  }

  if (!cin) {
    // No CIN provided — cannot verify corporate structure, route to desk
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'CIN_REQUIRED_FOR_CORPORATE_VERIFICATION' } };
  }

  try {
    const res = await fetch('https://ind.idv.hyperverge.co/v1/company-basic', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'appId':         Deno.env.get('HYPERVERGE_APP_ID') ?? '',
        'appKey':        hypervergeApiKey,
        'transactionId': crypto.randomUUID(),
      },
      body: JSON.stringify({ cin }),
    });

    if (!res.ok) return { passed: false, status: 'MANUAL_REVIEW', detail: { http_status: res.status } };

    const data = await res.json() as {
      result?: { details?: { company_status?: string; company_name?: string } };
    };

    const companyStatus = data.result?.details?.company_status ?? '';
    const active = companyStatus.toLowerCase() === 'active';

    return {
      passed: active,
      status: active ? 'ACTIVE' : 'INACTIVE',
      detail: {
        company_status: companyStatus,
        company_name:   data.result?.details?.company_name,
      },
    };
  } catch {
    return { passed: false, status: 'MANUAL_REVIEW', detail: { error: 'MCA_REGISTRY_TIMEOUT' } };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const hypervergeKey  = Deno.env.get('HYPERVERGE_APP_KEY')        ?? '';

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: { job_id?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ── Pick up the oldest queued or partial job ──────────────────────────────
  let jobQuery = db
    .from('verification_jobs')
    .select('*')
    .in('status', ['QUEUED', 'PARTIAL_REVIEW'])
    .lt('attempts', 4)
    .or('next_attempt_at.is.null,next_attempt_at.lte.' + new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1);

  if (body.job_id) {
    jobQuery = db
      .from('verification_jobs')
      .select('*')
      .eq('id', body.job_id)
      .limit(1);
  }

  const { data: jobs, error: jobErr } = await jobQuery;
  if (jobErr || !jobs?.length) {
    return json({ ok: true, message: 'No jobs to process' });
  }

  const job = jobs[0] as {
    id: string; organization_id: string; status: string; attempts: number;
    ocr_status: string; pillar_1_tax_status: string; pillar_2_mca_status: string;
    error_logs: string[] | null;
  };

  // Lock the job: set to PROCESSING
  await db.from('verification_jobs').update({
    status:     'PROCESSING',
    attempts:   job.attempts + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  // ── Fetch org data ────────────────────────────────────────────────────────
  const { data: org } = await db
    .from('organizations')
    .select('id, name, gstin, business_pan, cin, address_proof_path, registration_type')
    .eq('id', job.organization_id)
    .single();

  if (!org) {
    const errorEntry = 'ORG_NOT_FOUND';
    await db.from('verification_jobs').update({
      status:     'FAILED',
      error_logs: [...(job.error_logs ?? []), errorEntry],
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return json({ ok: false, error: errorEntry });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const stepErrors: string[] = [];
  let anyFailed = false;

  // ── OCR congruence (skip if already PASSED) ───────────────────────────────
  if (job.ocr_status === 'QUEUED' && org.address_proof_path) {
    const ocrRes = await fetch(`${supabaseUrl}/functions/v1/ocr-doc-verify`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        org_id:        org.id,
        storage_path:  org.address_proof_path,
        typed_gstin:   org.gstin   ?? '',
        typed_pan:     org.business_pan ?? '',
        typed_company: org.name    ?? '',
      }),
    });

    if (ocrRes.ok) {
      const ocrData = await ocrRes.json() as {
        passed: boolean; route_to_manual: boolean;
        scores: { gstin: number | null; pan: number | null; company: number | null };
        issues: string[];
      };

      updates.ocr_status       = ocrData.route_to_manual ? 'MANUAL_REVIEW' : (ocrData.passed ? 'PASSED' : 'FAILED');
      updates.ocr_detail       = ocrData;
      if (!ocrData.passed) {
        anyFailed = true;
        stepErrors.push(`OCR:${updates.ocr_status as string}`);
      }
    } else {
      updates.ocr_status = 'MANUAL_REVIEW';
      updates.ocr_detail = { error: 'OCR_FUNCTION_UNAVAILABLE' };
      anyFailed = true;
      stepErrors.push('OCR:FUNCTION_UNAVAILABLE');
    }
  }

  // ── Pillar 1: Tax registry (GSTIN + PAN) ──────────────────────────────────
  if (job.pillar_1_tax_status === 'QUEUED') {
    const gstinResult = await verifyGstin(org.gstin ?? '', supabaseUrl, serviceRoleKey);
    const panResult   = await verifyPan(org.business_pan ?? '', hypervergeKey);

    const p1Passed = gstinResult.passed && panResult.passed;
    const p1Manual = gstinResult.status === 'MANUAL_REVIEW' || panResult.status === 'MANUAL_REVIEW';

    updates.pillar_1_tax_status  = p1Manual ? 'MANUAL_REVIEW' : (p1Passed ? 'PASSED' : 'FAILED');
    updates.pillar_1_tax_detail  = { gstin: gstinResult, pan: panResult };
    if (!p1Passed) {
      anyFailed = true;
      stepErrors.push(`P1:${updates.pillar_1_tax_status as string}`);
    }
  }

  // ── Pillar 2: MCA corporate structure ─────────────────────────────────────
  const corporateTypes = ['llp', 'pvt_ltd', 'public_ltd', 'partnership'];
  if (job.pillar_2_mca_status === 'QUEUED' && corporateTypes.includes(org.registration_type ?? '')) {
    const mcaResult = await verifyMCA(org.name, org.cin, org.business_pan ?? '', hypervergeKey);

    updates.pillar_2_mca_status  = mcaResult.status === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : (mcaResult.passed ? 'PASSED' : 'FAILED');
    updates.pillar_2_mca_detail  = mcaResult.detail;
    if (!mcaResult.passed) {
      anyFailed = true;
      stepErrors.push(`P2:${updates.pillar_2_mca_status as string}`);
    }
  }

  // ── Determine final job status ────────────────────────────────────────────
  const p1Done  = (updates.pillar_1_tax_status  ?? job.pillar_1_tax_status)  !== 'QUEUED';
  const ocrDone = (updates.ocr_status           ?? job.ocr_status)           !== 'QUEUED';

  const accumulatedErrors = [...(job.error_logs ?? []), ...stepErrors];

  if (anyFailed) {
    const hasManual = [updates.ocr_status, updates.pillar_1_tax_status, updates.pillar_2_mca_status]
      .some(s => s === 'MANUAL_REVIEW');
    updates.status     = hasManual ? 'PARTIAL_REVIEW' : 'FAILED';
    // Exponential backoff: 2^attempts minutes
    const backoffMs    = Math.pow(2, job.attempts) * 60_000;
    updates.next_attempt_at = new Date(Date.now() + backoffMs).toISOString();
  } else if (ocrDone && p1Done) {
    updates.status       = 'COMPLETED';
    updates.completed_at = new Date().toISOString();
  }

  if (accumulatedErrors.length) {
    updates.error_logs = accumulatedErrors;
  }

  await db.from('verification_jobs').update(updates).eq('id', job.id);

  // ── Audit log entry ───────────────────────────────────────────────────────
  await db.from('verification_audit_logs').insert({
    org_id:          org.id,
    changed_by:      null,
    previous_status: 'pending',
    new_status:      'pending',
    notes: `worker_run: ocr=${updates.ocr_status ?? 'skip'} p1=${updates.pillar_1_tax_status ?? 'skip'} p2=${updates.pillar_2_mca_status ?? 'skip'}`,
  });

  return json({
    ok:      true,
    job_id:  job.id,
    org_id:  org.id,
    results: {
      ocr:      updates.ocr_status,
      pillar_1: updates.pillar_1_tax_status,
      pillar_2: updates.pillar_2_mca_status ?? 'skipped',
    },
    status: updates.status,
  });
});
