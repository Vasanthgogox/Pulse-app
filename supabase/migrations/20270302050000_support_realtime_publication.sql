-- The Admin Console's SupportPanel subscribes to postgres_changes on these
-- three tables for live updates (same pattern DriverKycPanel already uses for
-- driver_kyc_submissions/driver_kyc_documents, which are in this publication
-- today -- confirmed via pg_publication_tables before writing this). Without
-- this, those subscriptions are silent no-ops; the panel still works via
-- manual refresh, but live updates need this.
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.support_ticket_comments;
alter publication supabase_realtime add table public.support_ticket_activity;
