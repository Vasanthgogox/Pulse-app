/**
 * Optional server-side checkpoint validation (rate limit + auth).
 * Primary path: client RPC `tracking_record_checkpoint` with RLS.
 * Use this Edge Function when you need service-role validation or external ingest.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ingestLog } from '../_shared/logWatcherIngest.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data, error } = await supabase.rpc('tracking_record_checkpoint', {
      p_trip_id: body.tripId,
      p_driver_id: body.driverId,
      p_org_id: body.orgId,
      p_session_id: body.sessionId,
      p_latitude: body.latitude,
      p_longitude: body.longitude,
      p_accuracy: body.accuracy ?? null,
      p_source: body.source ?? 'live',
      p_recorded_at: body.recordedAt ?? new Date().toISOString(),
    });

    if (error) {
      await ingestLog(
        supabase,
        'error',
        'RPC tracking_record_checkpoint failed',
        'RPCFailure',
        { service: 'tracking-checkpoint', operation: 'record-checkpoint', statusCode: 400, error: error.message }
      );
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      await ingestLog(
        supabase,
        'error',
        'Unhandled error in tracking-checkpoint',
        'UnhandledError',
        { service: 'tracking-checkpoint', operation: 'checkpoint', statusCode: 500, error: String(e) }
      );
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
