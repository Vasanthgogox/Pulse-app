-- Rename fleet_size → employee_count on organizations.
-- The previous migration (20260428140000) added fleet_size; this corrects the column name.
ALTER TABLE public.organizations
  RENAME COLUMN fleet_size TO employee_count;

-- Update handle_new_user to write employee_count instead of fleet_size
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
declare
  r                  text := coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'user');
  skip_org           boolean := coalesce((new.raw_user_meta_data->>'skip_org_creation')::boolean, false);
  org_id             uuid;
  org_name           text;
  profile_exists     boolean;
  org_exists         boolean;
  membership_exists  boolean;
begin
  select exists(select 1 from public.profiles where id = new.id) into profile_exists;
  if not profile_exists then
    insert into public.profiles (id, email, full_name, role, aggregated, asset, company_name, phone)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      case when r in ('user','driver') then r else 'user' end,
      case when r = 'driver' then false else coalesce((new.raw_user_meta_data->>'aggregated')::boolean, true) end,
      case when r = 'driver' then false else coalesce((new.raw_user_meta_data->>'asset')::boolean, true) end,
      nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'phone'), '')
    )
    on conflict (id) do nothing;
    raise log 'handle_new_user: profile created for user % (role %)', new.id, r;
  end if;

  if r = 'user' AND NOT skip_org then
    select id into org_id from public.organizations where owner_id = new.id limit 1;
    org_exists := (org_id is not null);

    if not org_exists then
      org_name := coalesce(
        nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'full_name'), '') || '''s Organization',
        nullif(trim(new.raw_user_meta_data->>'name'), '') || '''s Organization',
        'My Organization'
      );
      insert into public.organizations (
        owner_id, name, operating_model,
        address_line, city, state, zone,
        business_type, employee_count
      ) values (
        new.id,
        org_name,
        coalesce(nullif(trim(new.raw_user_meta_data->>'operating_model'), ''), 'HYBRID'),
        nullif(trim(new.raw_user_meta_data->>'address_line'), ''),
        nullif(trim(new.raw_user_meta_data->>'city'), ''),
        nullif(trim(new.raw_user_meta_data->>'state'), ''),
        nullif(trim(new.raw_user_meta_data->>'zone'), ''),
        nullif(trim(new.raw_user_meta_data->>'business_type'), ''),
        nullif(trim(new.raw_user_meta_data->>'employee_count'), '')
      )
      returning id into org_id;
      if org_id is null then
        raise exception 'handle_new_user: organizations insert did not return id for user %', new.id;
      end if;
      raise log 'handle_new_user: organization created % for user %', org_id, new.id;
    end if;

    select exists(
      select 1 from public.organization_members
      where organization_id = org_id and user_id = new.id
    ) into membership_exists;
    if not membership_exists then
      insert into public.organization_members (organization_id, user_id, role, status)
      values (org_id, new.id, 'owner', 'active')
      on conflict (organization_id, user_id) do update set status = 'active', role = 'owner';
      raise log 'handle_new_user: organization_membership created for user % in org %', new.id, org_id;
    end if;
  end if;

  return new;
exception
  when others then
    raise log 'handle_new_user FAILED for user % (email %): %', new.id, new.email, sqlerrm;
    raise;
end;
$$;
