-- A4.4 Phase 4 -- shared phone-masking helper.
--
-- Same display format as the client-side maskPhone() in
-- features/public-profile/mappers.ts ("•• •• 1234"), so a masked value
-- returned by an RPC renders identically to the existing public-profile
-- masking elsewhere in the app. Centralized here because two new RPCs
-- (list_market_bids_for_indent, list_my_org_market_bids) both need it for
-- the Marketplace contact-visibility policy: mask pre-award, reveal
-- (unmasked, server-side) only once a market_bids row is 'accepted'.

CREATE OR REPLACE FUNCTION public.mask_phone_last4(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR regexp_replace(p_phone, '\D', '', 'g') = '' THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) <= 4
      THEN '••' || regexp_replace(p_phone, '\D', '', 'g')
    ELSE '•• •• ' || right(regexp_replace(p_phone, '\D', '', 'g'), 4)
  END;
$$;

COMMENT ON FUNCTION public.mask_phone_last4(text) IS
  'A4.4: last-4-digits phone mask, same display format as the client-side maskPhone() in features/public-profile/mappers.ts. Used by RPCs enforcing the Marketplace contact-visibility policy (mask pre-award, reveal post-award) so masking happens server-side, never left to the client to apply to an already-unmasked value.';

REVOKE ALL ON FUNCTION public.mask_phone_last4(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mask_phone_last4(text) TO authenticated;
