-- Fix "permission denied for table ratings": grant to anon and authenticated.
-- Supabase may use anon role for API requests; RLS still restricts by is_org_member.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO anon;

-- Ensure anon can call is_org_member (used by RLS policy; SECURITY DEFINER runs as owner).
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO anon;
