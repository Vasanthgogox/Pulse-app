-- Drop the leftover 5-arg submit_business_verification overload.
--
-- History: 20261111000000 created the 5-arg signature (always required GSTIN +
-- GST certificate). 20261114000000 added a 6-arg overload with
-- p_gst_not_applicable. Postgres keeps both. The 5-arg body is a different
-- KYC policy (GST always required).
--
-- App callers always pass p_gst_not_applicable (Pulse wizard + legacy
-- BusinessVerificationWizard). No edge function, Admin console, or SQL
-- consumer uses the 5-arg signature.
--
-- Do not edit 20261114 — that file is history. This DROP is the cleanup.
-- The 6-arg function (uuid, registration_type_enum, text, text, text, boolean)
-- is unchanged.

DROP FUNCTION IF EXISTS public.submit_business_verification(
  uuid,
  public.registration_type_enum,
  text,
  text,
  text
);
