-- S2 prep: distinguish agent replies from user replies in the conversation.
-- Existing S1 comments (both from the real SUP-000001 test ticket and any
-- future user-only activity) get 'user' via the column default -- correct
-- semantics, since 'user' is the only kind of comment that existed before S2.
--
-- author_user_id becomes nullable because the S2 Admin Console has no
-- authenticated agent identity yet (deferred to S3, per the locked phase
-- boundary) -- an agent reply has no real user id to attribute to, by
-- design, not by omission. S3 is expected to make this column meaningful
-- again for agent-authored rows once real agent auth exists.

alter table public.support_ticket_comments
  add column author_type text not null default 'user';

alter table public.support_ticket_comments
  add constraint support_ticket_comments_author_type_check
  check (author_type = any (array['user', 'agent']));

alter table public.support_ticket_comments
  alter column author_user_id drop not null;
