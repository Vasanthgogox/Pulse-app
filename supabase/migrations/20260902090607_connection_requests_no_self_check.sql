-- An organization must never hold a connection request to itself.
-- Verified universal: on_connection_request_approved() would otherwise write
-- self-referential client AND supplier rows for the same org.
-- Pre-migration check confirmed 0 violating rows.
ALTER TABLE public.connection_requests
  ADD CONSTRAINT connection_requests_no_self
  CHECK (from_organization_id <> to_organization_id);