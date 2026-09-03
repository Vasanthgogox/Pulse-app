-- Support Phase 3 — a count-only endpoint for the nav badge.
--
-- The header badge (analytics/src/App.tsx) called fetchAllSupportTickets() --
-- `select * from support_tickets`, every column of every row -- and then counted
-- the matching ones in JavaScript, to render a single integer. That runs on every
-- screen of the console, not just Support, and re-runs on every support_tickets
-- change. The payload is the entire ticket table; the answer is one number.
--
-- This returns just the number. It is the same predicate as
-- supportTicketNeedsAgentAttention() in analytics/src/lib/supportTickets.ts and
-- as the 'needs_attention' field of admin_list_support_tickets(), kept in one
-- shape across all three so the badge and the queue can never disagree.
--
-- Backed by idx_support_tickets_needs_attention (created in 20270304010000),
-- whose partial predicate matches the two constant conditions below.
create or replace function public.admin_support_attention_count()
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when not public.can_view_support() then null::integer
    else (
      select count(*)::integer
      from public.support_tickets t
      where t.status not in ('resolved', 'closed')
        and t.last_public_author_type = 'user'
        and t.last_public_activity_at is not null
        and (
          t.agent_last_read_at is null
          or t.last_public_activity_at > t.agent_last_read_at
        )
    )
  end;
$$;

-- Returns null rather than raising for an unauthorized caller: this drives a
-- passive header badge that every console screen mounts, including for admins
-- who may hold no Support permission at all. An exception there would surface as
-- a console-wide error for a decorative element, so the badge simply renders
-- nothing. Authorization is unchanged -- a caller without support.view still
-- learns no ticket data, and every path that returns actual ticket content
-- (admin_list_support_tickets, the RLS policies) still raises or filters.
revoke all on function public.admin_support_attention_count() from public, anon;
grant execute on function public.admin_support_attention_count()
  to authenticated, service_role;
