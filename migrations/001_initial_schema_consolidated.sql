


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_invite public.driver_invites; v_profile public.profiles; v_driver_id uuid;
begin
  select * into v_invite from public.driver_invites where id = p_invite_id and to_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Invite not found or already responded'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
  insert into public.drivers (organization_id, name, phone, email, user_id, status)
  values (v_invite.from_organization_id, coalesce(nullif(trim(v_profile.full_name), ''), 'Driver'),
    nullif(trim(v_profile.phone), ''), nullif(trim(v_profile.email), ''), auth.uid(), 'offline')
  returning id into v_driver_id;
  update public.driver_invites set status = 'accepted', responded_at = now(), responded_by = auth.uid() where id = p_invite_id;
  return jsonb_build_object('driver_id', v_driver_id, 'organization_id', v_invite.from_organization_id);
end; $$;


ALTER FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") IS 'Driver accepts fleet invite: creates driver row in that org and marks invite accepted.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "status" "text" DEFAULT 'offline'::"text" NOT NULL,
    "assigned_vehicle_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "license_number" "text",
    "email" "text",
    "emergency_contact" "text",
    "emergency_name" "text",
    "license_expiry" "date",
    "user_id" "uuid",
    CONSTRAINT "drivers_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'on_trip'::"text"])))
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drivers"."license_number" IS 'Driving license number';



COMMENT ON COLUMN "public"."drivers"."license_expiry" IS 'License expiry date for document alerts';



CREATE OR REPLACE FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text") RETURNS "public"."drivers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_driver public.drivers;
  v_user_id uuid;
begin
  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    raise exception 'Driver not found';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_driver.organization_id and om.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this organization';
  end if;

  if (p_phone is null or trim(p_phone) = '') and (p_email is null or trim(p_email) = '') then
    raise exception 'Provide at least one of phone or email to link to a driver account';
  end if;

  select id into v_user_id
  from public.profiles
  where role = 'driver'
    and (
      (p_email is not null and trim(p_email) <> '' and trim(lower(email)) = trim(lower(p_email)))
      or (p_phone is not null and trim(p_phone) <> '' and trim(phone) = trim(p_phone))
    )
  limit 1;

  if v_user_id is null then
    raise exception 'No driver account found with that email or phone. They must sign up as a driver first.';
  end if;

  update public.drivers set user_id = v_user_id, updated_at = now() where id = p_driver_id
  returning * into v_driver;
  return v_driver;
end;
$$;


ALTER FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text", "p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text", "p_email" "text") IS 'Link driver to an app account (profile with role=driver) by email or phone. Caller must be org member.';



CREATE OR REPLACE FUNCTION "public"."check_bidder_not_indent_client"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_org_id uuid;
begin
  select i.client_organization_id
  into v_client_org_id
  from public.marketplace_listings ml
  join public.indents i on i.id = ml.indent_id
  where ml.id = new.listing_id;

  if v_client_org_id is not null and v_client_org_id = new.bidder_organization_id then
    raise exception 'The client of this load cannot bid on it. Margin integrity: client organization is excluded from supplier access for this indent.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_bidder_not_indent_client"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_bidder_not_indent_client"() IS 'Prevents inserting a bid when bidder_organization_id is the indent client (margin integrity).';



CREATE OR REPLACE FUNCTION "public"."detach_driver"("p_driver_id" "uuid") RETURNS "public"."drivers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_driver public.drivers;
begin
  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    raise exception 'Driver not found';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_driver.organization_id and om.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this organization';
  end if;

  update public.drivers set user_id = null, updated_at = now() where id = p_driver_id
  returning * into v_driver;
  return v_driver;
end;
$$;


ALTER FUNCTION "public"."detach_driver"("p_driver_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."detach_driver"("p_driver_id" "uuid") IS 'Unlink driver from app account (set user_id = null). Caller must be org member.';



CREATE OR REPLACE FUNCTION "public"."dispatcher_inventory_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."dispatcher_inventory_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatcher_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."dispatcher_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.drivers
    where id = p_driver_id and user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") IS 'Used by trips RLS to avoid recursion: checks driver ownership without reading drivers under RLS.';



CREATE OR REPLACE FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trips t
    inner join public.indents i on i.id = t.indent_id
    inner join public.organization_members om on om.organization_id = i.organization_id and om.user_id = auth.uid()
    where t.driver_id = p_driver_id
  );
$$;


ALTER FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") IS 'Used by drivers RLS: indent owner can read driver of trip from their indent. Scoped to auth.uid().';



CREATE OR REPLACE FUNCTION "public"."ensure_marketplace_listing_for_indent"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.circulation_target in ('marketplace', 'both') then
    insert into public.marketplace_listings (indent_id, organization_id, status)
    select new.id, new.organization_id, 'active'
    where not exists (select 1 from public.marketplace_listings ml where ml.indent_id = new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_marketplace_listing_for_indent"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ensure_marketplace_listing_for_indent"() IS 'Creates a marketplace_listings row when indent is marketplace/both so bids can reference it';



CREATE OR REPLACE FUNCTION "public"."generate_client_display_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.display_id is null then
    new.display_id := 'CL-' || substring(new.id::text from length(new.id::text) - 3);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."generate_client_display_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") RETURNS TABLE("id" "uuid", "from_organization_id" "uuid", "to_organization_id" "uuid", "request_shipper_client" boolean, "request_carrier_supplier" boolean, "status" "text", "created_at" timestamp with time zone, "responded_at" timestamp with time zone, "responded_by" "uuid", "from_org_name" "text", "to_org_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cr.id,
    cr.from_organization_id,
    cr.to_organization_id,
    cr.request_shipper_client,
    cr.request_carrier_supplier,
    cr.status,
    cr.created_at,
    cr.responded_at,
    cr.responded_by,
    coalesce(nullif(trim(fo.name), ''), 'Unknown organization') as from_org_name,
    coalesce(nullif(trim(to_org.name), ''), 'Unknown organization') as to_org_name
  from public.connection_requests cr
  left join public.organizations fo on fo.id = cr.from_organization_id
  left join public.organizations to_org on to_org.id = cr.to_organization_id
  where cr.id = p_request_id
    and exists (
      select 1 from public.organization_members om
      where om.organization_id in (cr.from_organization_id, cr.to_organization_id)
        and om.user_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") IS 'Get one connection request by id with org names. Caller must be member of from_org or to_org.';



CREATE OR REPLACE FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "from_organization_id" "uuid", "to_organization_id" "uuid", "request_shipper_client" boolean, "request_carrier_supplier" boolean, "status" "text", "created_at" timestamp with time zone, "responded_at" timestamp with time zone, "responded_by" "uuid", "from_org_name" "text", "to_org_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cr.id,
    cr.from_organization_id,
    cr.to_organization_id,
    cr.request_shipper_client,
    cr.request_carrier_supplier,
    cr.status,
    cr.created_at,
    cr.responded_at,
    cr.responded_by,
    coalesce(nullif(trim(fo.name), ''), 'Unknown organization') as from_org_name,
    coalesce(nullif(trim(to_org.name), ''), 'Unknown organization') as to_org_name
  from public.connection_requests cr
  left join public.organizations fo on fo.id = cr.from_organization_id
  left join public.organizations to_org on to_org.id = cr.to_organization_id
  where cr.to_organization_id = p_org_id
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_org_id and om.user_id = auth.uid()
    )
  order by cr.created_at desc;
$$;


ALTER FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") IS 'List connection requests received by org with from_org_name and to_org_name from organizations. Caller must be member of p_org_id.';



CREATE OR REPLACE FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "from_organization_id" "uuid", "to_organization_id" "uuid", "request_shipper_client" boolean, "request_carrier_supplier" boolean, "status" "text", "created_at" timestamp with time zone, "responded_at" timestamp with time zone, "responded_by" "uuid", "from_org_name" "text", "to_org_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cr.id,
    cr.from_organization_id,
    cr.to_organization_id,
    cr.request_shipper_client,
    cr.request_carrier_supplier,
    cr.status,
    cr.created_at,
    cr.responded_at,
    cr.responded_by,
    coalesce(nullif(trim(fo.name), ''), 'Unknown organization') as from_org_name,
    coalesce(nullif(trim(to_org.name), ''), 'Unknown organization') as to_org_name
  from public.connection_requests cr
  left join public.organizations fo on fo.id = cr.from_organization_id
  left join public.organizations to_org on to_org.id = cr.to_organization_id
  where cr.from_organization_id = p_org_id
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_org_id and om.user_id = auth.uid()
    )
  order by cr.created_at desc;
$$;


ALTER FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") IS 'List connection requests sent by org with from_org_name and to_org_name. Caller must be member of p_org_id.';



CREATE OR REPLACE FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") RETURNS TABLE("id" "uuid", "indent_id" "uuid", "bidder_organization_id" "uuid", "amount" numeric, "notes" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "driver_id" "uuid", "vehicle_id" "uuid", "bidder_organization_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    dq.id,
    dq.indent_id,
    dq.bidder_organization_id,
    dq.amount,
    dq.notes,
    dq.status,
    dq.created_at,
    dq.updated_at,
    dq.driver_id,
    dq.vehicle_id,
    coalesce(nullif(trim(o.name), ''), 'Supplier') as bidder_organization_name
  from public.direct_quotes dq
  left join public.organizations o on o.id = dq.bidder_organization_id
  where dq.indent_id = p_indent_id
    and exists (
      select 1 from public.indents i
      join public.organization_members om on om.organization_id = i.organization_id and om.user_id = auth.uid()
      where i.id = dq.indent_id
    )
  order by dq.created_at desc;
$$;


ALTER FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") IS 'List direct quotes for an indent with bidder org name. Caller must be member of indent org.';



CREATE OR REPLACE FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") RETURNS TABLE("user_id" "uuid", "full_name" "text", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_name text;
  v_phone text;
  v_normalized text;
begin
  v_normalized := trim(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  if v_normalized = '' then
    return;
  end if;

  select pr.id, trim(coalesce(pr.full_name, '')), trim(coalesce(pr.phone, ''))
  into v_user_id, v_name, v_phone
  from public.profiles pr
  where pr.role = 'driver'
    and trim(regexp_replace(coalesce(pr.phone, ''), '\s+', '', 'g')) = v_normalized
  limit 1;

  if v_user_id is null then
    return;
  end if;

  user_id := v_user_id;
  full_name := case when v_name <> '' then v_name else v_phone end;
  phone := v_phone;
  return next;
end;
$$;


ALTER FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") IS 'Returns user_id, full_name, phone for a driver profile with the given phone (for Add driver by phone).';



CREATE OR REPLACE FUNCTION "public"."get_driver_invites_received"() RETURNS TABLE("id" "uuid", "from_organization_id" "uuid", "to_user_id" "uuid", "status" "text", "created_at" timestamp with time zone, "responded_at" timestamp with time zone, "responded_by" "uuid", "from_org_name" "text", "payable_amount" numeric, "commission_percent" numeric, "commission_per_km" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    di.id,
    di.from_organization_id,
    di.to_user_id,
    di.status,
    di.created_at,
    di.responded_at,
    di.responded_by,
    coalesce(nullif(trim(o.name), ''), 'Company') as from_org_name,
    coalesce(di.payable_amount, (di.offer_details->>'payable_amount')::numeric) as payable_amount,
    coalesce(di.commission_percent, (di.offer_details->>'commission_percent')::numeric) as commission_percent,
    coalesce(di.commission_per_km, (di.offer_details->>'commission_per_km')::numeric) as commission_per_km
  from public.driver_invites di
  left join public.organizations o on o.id = di.from_organization_id
  where di.to_user_id = auth.uid()
  order by di.created_at desc;
$$;


ALTER FUNCTION "public"."get_driver_invites_received"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_driver_invites_received"() IS 'List driver invites for current user; offer from columns or offer_details so driver always sees applied offer.';



CREATE OR REPLACE FUNCTION "public"."get_driver_linked_org"() RETURNS TABLE("organization_id" "uuid", "organization_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.id, nullif(trim(o.name), '')::text
  from public.drivers d
  join public.organizations o on o.id = d.organization_id
  where d.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."get_driver_linked_org"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_driver_linked_org"() IS 'Returns the linked organization id and name for the current user''s driver row. Used by driver app Fleet Network to show Integrated Fleet Owner name.';



CREATE OR REPLACE FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  i record;
  viewer_org_id uuid;
  out_json jsonb;
begin
  select organization_id into viewer_org_id
  from public.organization_members
  where user_id = auth.uid()
  limit 1;

  if viewer_org_id is null then
    return null;
  end if;

  select * into i from public.indents where id = p_indent_id;
  if not found then
    return null;
  end if;

  if i.organization_id = viewer_org_id then
    return to_jsonb(i);
  end if;

  -- Client org sees indent only if there is an accepted connection (client_supplier) from creator to them
  if i.client_organization_id = viewer_org_id then
    if exists (
      select 1 from public.organization_relations r
      where r.from_organization_id = i.organization_id
        and r.to_organization_id = viewer_org_id
        and r.relation_type = 'client_supplier'
        and r.status = 'active'
    ) then
      out_json := jsonb_build_object(
        'id', i.id, 'organization_id', i.organization_id, 'indent_number', i.indent_number,
        'pickup_area', i.pickup_area, 'drop_location', i.drop_location, 'client_id', i.client_id,
        'client_name', i.client_name, 'client_price', i.client_price, 'client_organization_id', i.client_organization_id,
        'status', i.status, 'vehicle_type', i.vehicle_type, 'load_type', i.load_type,
        'pickup_date', i.pickup_date, 'circulation_target', i.circulation_target,
        'created_at', i.created_at, 'updated_at', i.updated_at
      );
      return out_json;
    end if;
    return null;
  end if;

  if i.assigned_supplier_id = viewer_org_id then
    out_json := jsonb_build_object(
      'id', i.id, 'organization_id', i.organization_id, 'indent_number', i.indent_number,
      'pickup_area', i.pickup_area, 'drop_location', i.drop_location, 'client_name', i.client_name,
      'assigned_supplier_id', i.assigned_supplier_id, 'assigned_supplier_rate', i.assigned_supplier_rate,
      'supplier_target', i.supplier_target, 'status', i.status, 'vehicle_type', i.vehicle_type,
      'load_type', i.load_type, 'pickup_date', i.pickup_date, 'circulation_target', i.circulation_target,
      'created_at', i.created_at, 'updated_at', i.updated_at
    );
    return out_json;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") IS 'Returns indent with role-appropriate fields. Client org sees indent only when there is an active client_supplier connection.';



CREATE OR REPLACE FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") RETURNS TABLE("organization_id" "uuid", "full_name" "text", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_name text;
  v_phone text;
  v_normalized text;
begin
  v_normalized := trim(regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g'));
  if v_normalized = '' then
    return;
  end if;

  select pr.id, trim(coalesce(pr.full_name, '')), trim(coalesce(pr.phone, ''))
  into v_user_id, v_name, v_phone
  from public.profiles pr
  where trim(regexp_replace(coalesce(pr.phone, ''), '\s+', '', 'g')) = v_normalized
  limit 1;

  if v_user_id is null then
    return;
  end if;

  select om.organization_id into v_org_id
  from public.organization_members om
  where om.user_id = v_user_id and om.status = 'active'
  limit 1;

  if v_org_id is null then
    return;
  end if;

  organization_id := v_org_id;
  full_name       := case when v_name <> '' then v_name else v_phone end;
  phone           := v_phone;
  return next;
end;
$$;


ALTER FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") IS 'Returns org id and display name for a user with the given phone (for connection request invite by phone, WhatsApp-style).';



CREATE OR REPLACE FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") RETURNS TABLE("id" "uuid", "listing_id" "uuid", "bidder_organization_id" "uuid", "driver_id" "uuid", "vehicle_id" "uuid", "amount" numeric, "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "bidder_organization_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    mb.id,
    mb.listing_id,
    mb.bidder_organization_id,
    mb.driver_id,
    mb.vehicle_id,
    mb.amount,
    mb.status,
    mb.created_at,
    mb.updated_at,
    coalesce(nullif(trim(o.name), ''), 'Supplier') as bidder_organization_name
  from public.marketplace_bids mb
  left join public.organizations o on o.id = mb.bidder_organization_id
  where mb.listing_id = p_listing_id
    and exists (
      select 1 from public.marketplace_listings ml
      join public.organization_members om on om.organization_id = ml.organization_id and om.user_id = auth.uid()
      where ml.id = mb.listing_id
    )
  order by mb.created_at desc;
$$;


ALTER FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") IS 'List marketplace bids for a listing with bidder org name. Caller must be listing owner.';



CREATE OR REPLACE FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  next_val int;
begin
  insert into public.org_display_sequences (organization_id, indents_next)
  values (p_org_id, 1)
  on conflict (organization_id) do update
  set indents_next = org_display_sequences.indents_next + 1,
      updated_at = now()
  returning indents_next into next_val;
  return next_val;
end;
$$;


ALTER FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") IS 'Returns next indent sequence for org. O(1). Used by indents insert trigger.';



CREATE OR REPLACE FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  next_val int;
begin
  insert into public.org_display_sequences (organization_id, trips_next)
  values (p_org_id, 1)
  on conflict (organization_id) do update
  set trips_next = org_display_sequences.trips_next + 1,
      updated_at = now()
  returning trips_next into next_val;
  return next_val;
end;
$$;


ALTER FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") IS 'Returns next trip sequence for org. O(1). Used by trips insert trigger.';



CREATE OR REPLACE FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_org_id uuid;
begin
  if p_email is null or trim(p_email) = '' then
    return null;
  end if;

  select id into v_user_id
  from public.profiles
  where trim(lower(email)) = trim(lower(p_email))
  limit 1;

  if v_user_id is null then
    return null;
  end if;

  select organization_id into v_org_id
  from public.organization_members
  where user_id = v_user_id and status = 'active'
  limit 1;

  return v_org_id;
end;
$$;


ALTER FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") IS 'Returns organization id for a user with the given email (for connection request invite by email).';



CREATE OR REPLACE FUNCTION "public"."get_organizations_for_user"() RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "owner_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  -- First return orgs where user has an active membership
  return query
  select o.id, o.name, o.slug, o.owner_id
  from public.organizations o
  where exists (
    select 1 from public.organization_members om
    where om.organization_id = o.id and om.user_id = v_uid and om.status = 'active'
  );

  -- If we already returned rows, done
  if found then
    return;
  end if;

  -- No memberships: find orgs where user is owner_id, ensure membership row exists, then return them
  insert into public.organization_members (organization_id, user_id, role, status)
  select o.id, o.owner_id, 'owner', 'active'
  from public.organizations o
  where o.owner_id = v_uid
    and not exists (
      select 1 from public.organization_members om
      where om.organization_id = o.id and om.user_id = o.owner_id
    )
  on conflict (organization_id, user_id) do update set status = 'active', role = 'owner';

  return query
  select o.id, o.name, o.slug, o.owner_id
  from public.organizations o
  where o.owner_id = v_uid;
end;
$$;


ALTER FUNCTION "public"."get_organizations_for_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organizations_for_user"() IS 'Returns organizations for the current user (from memberships or owned orgs). Creates missing organization_members for owned orgs.';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r text := coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'user');
  org_id uuid;
  org_name text;
  profile_exists boolean;
  org_exists boolean;
  membership_exists boolean;
begin
  -- Idempotent: skip if profile already exists (re-run / backfill safe)
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

  if r = 'user' then
    select id into org_id from public.organizations where owner_id = new.id limit 1;
    org_exists := (org_id is not null);

    if not org_exists then
      org_name := coalesce(
        nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'full_name'), '') || '''s Organization',
        nullif(trim(new.raw_user_meta_data->>'name'), '') || '''s Organization',
        'My Organization'
      );
      insert into public.organizations (owner_id, name)
      values (new.id, org_name)
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
    raise;  -- re-raise so auth.users insert rolls back → no partial state
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Runs atomically on auth.users insert. Creates profile; for role=user creates org + membership. Idempotent. Re-raises on failure so signup rolls back.';



CREATE OR REPLACE FUNCTION "public"."indents_set_display_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.sequence_number := public.get_next_indent_sequence(new.organization_id);
  new.display_indent_id := 'IND' || lpad(new.sequence_number::text, 3, '0');
  if new.indent_number is null or trim(new.indent_number) = '' then
    new.indent_number := new.display_indent_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."indents_set_display_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."inventory_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_clients_suppliers_on_org_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_phone text;
  v_company text;
  v_name text;
begin
  if new.owner_id is null then
    return new;
  end if;

  select trim(lower( coalesce(p.email, '') )),
         trim( coalesce(p.phone, '') ),
         trim( coalesce(p.company_name, '') ),
         trim( coalesce(p.full_name, '') )
  into v_email, v_phone, v_company, v_name
  from public.profiles p
  where p.id = new.owner_id;

  -- Match clients (in other orgs): same email, phone, or name/company
  update public.clients
  set linked_organization_id = new.id,
      is_integrated = true,
      updated_at = now()
  where organization_id <> new.id
    and linked_organization_id is null
    and (
      (v_email <> '' and email is not null and trim(lower(email)) = v_email)
      or (v_phone <> '' and phone is not null and trim(phone) = v_phone)
      or (v_company <> '' and trim(coalesce(name, '')) = v_company)
      or (v_name <> '' and trim(coalesce(name, '')) = v_name)
    );

  -- Match suppliers (in other orgs): same email, phone, or company_name
  update public.suppliers
  set linked_organization_id = new.id,
      supplier_type = 'integrated',
      updated_at = now()
  where organization_id <> new.id
    and linked_organization_id is null
    and (
      (v_email <> '' and email is not null and trim(lower(email)) = v_email)
      or (v_phone <> '' and phone is not null and trim(phone) = v_phone)
      or (v_company <> '' and coalesce(company_name, name) is not null and trim(coalesce(company_name, name)) = v_company)
    );

  return new;
end;
$$;


ALTER FUNCTION "public"."link_clients_suppliers_on_org_created"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_clients_suppliers_on_org_created"() IS 'On new org (signup), link any client/supplier rows in other orgs that match owner email/phone/company so they become integrated.';



CREATE OR REPLACE FUNCTION "public"."link_drivers_on_driver_profile_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pool_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_email text := nullif(trim(new.email), '');
  v_phone text := nullif(trim(new.phone), '');
begin
  if new.role <> 'driver' then
    return new;
  end if;

  -- Link existing driver rows: only when (email matches) OR (phone matches AND emails consistent)
  -- Do NOT link when phone matches but email differs (both non-null) → create isolated record
  update public.drivers d
  set user_id = new.id,
      updated_at = now()
  where d.user_id is null
    and (
      (v_email is not null and d.email is not null and trim(lower(d.email)) = trim(lower(new.email)))
      or (
        v_phone is not null and d.phone is not null and trim(d.phone) = trim(new.phone)
        and (v_email is null or d.email is null or trim(lower(d.email)) = trim(lower(new.email)))
      )
    );

  -- Ensure Driver Pool org exists
  if not exists (select 1 from public.organizations where id = v_pool_id) then
    raise exception 'link_drivers: Driver Pool organization missing (id %)', v_pool_id;
  end if;

  -- Idempotent: one driver row per (pool, user). Partial unique index prevents duplicates.
  if not exists (select 1 from public.drivers where organization_id = v_pool_id and user_id = new.id) then
    insert into public.drivers (organization_id, name, phone, email, user_id, status)
    values (
      v_pool_id,
      coalesce(nullif(trim(new.full_name), ''), 'Driver'),
      v_phone,
      v_email,
      new.id,
      'offline'
    );
  end if;

  raise log 'link_drivers: driver row ensured in pool for user %', new.id;
  return new;
exception
  when others then
    raise log 'link_drivers_on_driver_profile_created FAILED for user %: %', new.id, sqlerrm;
    raise;
end;
$$;


ALTER FUNCTION "public"."link_drivers_on_driver_profile_created"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."link_drivers_on_driver_profile_created"() IS 'On driver profile insert: link existing drivers by email or phone (only when emails consistent); ensure one driver row in Driver Pool per user. Idempotent. Re-raises on failure.';



CREATE OR REPLACE FUNCTION "public"."on_connection_request_approved"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_to_owner_id uuid;
  v_from_owner_id uuid;
  v_to_owner_phone text;
  v_from_owner_phone text;
  v_supplier_linked int := 0;
  v_already_supplier int;
  v_client_linked int := 0;
  v_already_client int;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  -- Organization relations (unchanged)
  if new.request_carrier_supplier then
    insert into public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    values (new.from_organization_id, new.to_organization_id, 'client_supplier', 'active')
    on conflict (from_organization_id, to_organization_id, relation_type) do update set status = 'active', updated_at = now();
  end if;
  if new.request_shipper_client then
    insert into public.organization_relations (from_organization_id, to_organization_id, relation_type, status)
    values (new.from_organization_id, new.to_organization_id, 'supplier_client', 'active')
    on conflict (from_organization_id, to_organization_id, relation_type) do update set status = 'active', updated_at = now();
  end if;

  -- ---------- FROM_ORG (sender, User 1): acceptor (to_org, User 2) as SUPPLIER only ----------
  -- Check if supplier already exists (by linked_organization_id)
  select 1 into v_already_supplier
  from public.suppliers
  where organization_id = new.from_organization_id and linked_organization_id = new.to_organization_id
  limit 1;

  if v_already_supplier is null then
    -- Try to link existing supplier by phone if acceptor has phone
    select o.owner_id into v_to_owner_id from public.organizations o where o.id = new.to_organization_id;
    if v_to_owner_id is not null then
      select trim(coalesce(p.phone, '')) into v_to_owner_phone from public.profiles p where p.id = v_to_owner_id;
      if v_to_owner_phone <> '' then
        -- Link existing supplier in from_org (same phone as to_org owner)
        update public.suppliers
        set linked_organization_id = new.to_organization_id,
            supplier_type = 'integrated',
            updated_at = now()
        where organization_id = new.from_organization_id
          and (linked_organization_id is null or linked_organization_id <> new.to_organization_id)
          and phone is not null
          and trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_to_owner_phone, '\s+', '', 'g'));
        get diagnostics v_supplier_linked = row_count;
      end if;
    end if;

    -- If no supplier was linked by phone, create a new one (always create so sender sees acceptor)
    if v_supplier_linked = 0 then
      insert into public.suppliers (
        organization_id, name, phone, email, linked_organization_id, supplier_type, updated_at
      )
      select
        new.from_organization_id,
        coalesce(nullif(trim(o.name), ''), nullif(trim(p.full_name), ''), 'Connected'),
        p.phone,
        p.email,
        new.to_organization_id,
        'integrated',
        now()
      from public.organizations o
      join public.profiles p on p.id = o.owner_id
      where o.id = new.to_organization_id;
    end if;
  else
    -- Supplier already exists, ensure it's marked as integrated
    update public.suppliers
    set supplier_type = 'integrated',
        linked_organization_id = new.to_organization_id,
        updated_at = now()
    where organization_id = new.from_organization_id and linked_organization_id = new.to_organization_id;
  end if;

  -- ---------- TO_ORG (acceptor, User 2): sender (from_org, User 1) as CLIENT ----------
  -- Check if client already exists (by linked_organization_id)
  select 1 into v_already_client
  from public.clients
  where organization_id = new.to_organization_id and linked_organization_id = new.from_organization_id
  limit 1;

  if v_already_client is null then
    -- Try to link existing client by phone if sender has phone
    select o.owner_id into v_from_owner_id from public.organizations o where o.id = new.from_organization_id;
    if v_from_owner_id is not null then
      select trim(coalesce(p.phone, '')) into v_from_owner_phone from public.profiles p where p.id = v_from_owner_id;
      if v_from_owner_phone <> '' then
        -- Link existing client in to_org (same phone as from_org owner)
        update public.clients
        set linked_organization_id = new.from_organization_id,
            is_integrated = true,
            updated_at = now()
        where organization_id = new.to_organization_id
          and linked_organization_id is null
          and phone is not null
          and trim(regexp_replace(coalesce(phone, ''), '\s+', '', 'g')) = trim(regexp_replace(v_from_owner_phone, '\s+', '', 'g'));
        get diagnostics v_client_linked = row_count;
      end if;
    end if;

    -- If no client was linked by phone, create a new one (always create so acceptor sees sender)
    if v_client_linked = 0 then
      insert into public.clients (
        organization_id, name, phone, email, linked_organization_id, is_integrated, updated_at
      )
      select
        new.to_organization_id,
        coalesce(nullif(trim(o.name), ''), nullif(trim(p.full_name), ''), 'Connected'),
        p.phone,
        p.email,
        new.from_organization_id,
        true,
        now()
      from public.organizations o
      join public.profiles p on p.id = o.owner_id
      where o.id = new.from_organization_id;
    end if;
  else
    -- Client already exists, ensure it's marked as integrated
    update public.clients
    set is_integrated = true,
        linked_organization_id = new.from_organization_id,
        updated_at = now()
    where organization_id = new.to_organization_id and linked_organization_id = new.from_organization_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."on_connection_request_approved"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."on_connection_request_approved"() IS 'On approve: create organization_relations; in from_org add to_org as supplier (always creates if missing); in to_org add from_org as client (always creates if missing).';



CREATE OR REPLACE FUNCTION "public"."orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.driver_invites set status = 'rejected', responded_at = now(), responded_by = auth.uid()
  where id = p_invite_id and to_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Invite not found or already responded'; end if;
  return;
end; $$;


ALTER FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") IS 'Driver rejects fleet invite.';



CREATE OR REPLACE FUNCTION "public"."set_driver_invite_from_org_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.from_org_name is null or trim(coalesce(new.from_org_name, '')) = '' then
    select name into new.from_org_name
    from public.organizations
    where id = new.from_organization_id;
    new.from_org_name := coalesce(nullif(trim(coalesce(new.from_org_name, '')), ''), 'Unknown');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_driver_invite_from_org_name"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_driver_invite_from_org_name"() IS 'Sets from_org_name on driver_invites from organizations.name when not provided.';



CREATE OR REPLACE FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'accepted' then
    update public.indents i
    set
      assigned_supplier_id = new.bidder_organization_id,
      assigned_supplier_rate = new.amount,
      updated_at = now()
    from public.marketplace_listings ml
    where ml.id = new.listing_id and i.id = ml.indent_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() IS 'On marketplace_bids.status -> accepted: set indent.assigned_supplier_id and assigned_supplier_rate from winning bid.';



CREATE OR REPLACE FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'accepted' then
    update public.indents
    set
      assigned_supplier_id = new.bidder_organization_id,
      assigned_supplier_rate = new.amount,
      updated_at = now()
    where id = new.indent_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() IS 'On direct_quotes.status -> accepted: set indent.assigned_supplier_id and assigned_supplier_rate from quote amount.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_indent_client_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  fallback text;
begin
  if new.client_id is not null then
    fallback := new.client_name;
    select c.name into new.client_name
    from public.clients c
    where c.id = new.client_id;
    if new.client_name is null then
      new.client_name := coalesce(fallback, '');
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_indent_client_name"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_indent_client_name"() IS 'Keeps indents.client_name in sync with clients.name when client_id is set.';



CREATE OR REPLACE FUNCTION "public"."sync_trip_client_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  fallback text;
begin
  if new.client_id is not null then
    fallback := new.client_name;
    select c.name into new.client_name
    from public.clients c
    where c.id = new.client_id;
    if new.client_name is null then
      new.client_name := coalesce(fallback, '');
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_trip_client_name"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_trip_client_name"() IS 'Keeps trips.client_name in sync with clients.name when client_id is set.';



CREATE OR REPLACE FUNCTION "public"."trips_set_display_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.sequence_number := public.get_next_trip_sequence(new.organization_id);
  new.display_trip_id := 'TRP' || lpad(new.sequence_number::text, 3, '0');
  if new.trip_number is null or trim(new.trip_number) = '' then
    new.trip_number := new.display_trip_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trips_set_display_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trips_sync_driver_vehicle_display"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.driver_id is not null then
    select name into new.driver_display_name from public.drivers where id = new.driver_id;
  else
    new.driver_display_name := null;
  end if;
  if new.vehicle_id is not null then
    select vehicle_number into new.vehicle_display_number from public.vehicles where id = new.vehicle_id;
  else
    new.vehicle_display_number := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trips_sync_driver_vehicle_display"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trips_sync_driver_vehicle_display"() IS 'Keeps trips.driver_display_name and vehicle_display_number in sync with drivers/vehicles when driver_id/vehicle_id change.';



CREATE OR REPLACE FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.drivers d
    where d.organization_id = p_organization_id
      and d.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") IS 'Used by organizations RLS to allow drivers to read their linked org without recursing into drivers. Scoped to current user (auth.uid()) only.';



CREATE OR REPLACE FUNCTION "public"."validate_vehicles_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  doc_key text;
  doc jsonb;
  doc_url text;
  doc_expiry text;
begin
  if NEW.documents is null then
    NEW.documents := '{}'::jsonb;
    return NEW;
  end if;

  for doc_key in select jsonb_object_keys(NEW.documents)
  loop
    doc := NEW.documents -> doc_key;
    if doc is null or jsonb_typeof(doc) <> 'object' then
      continue;
    end if;

    doc_url := doc ->> 'url';
    if doc_url is not null and trim(doc_url) <> '' then
      doc_expiry := doc ->> 'expiryDate';
      if doc_expiry is null or trim(doc_expiry) = '' then
        raise exception 'Vehicle document "%" has a url but no expiry date. Set expiry for every uploaded document.', doc_key
          using errcode = 'check_violation';
      end if;
    end if;

    if doc ? 'ocrData' then
      if jsonb_typeof(doc -> 'ocrData') <> 'object' then
        raise exception 'Vehicle document "%" ocrData must be a JSON object.', doc_key
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."validate_vehicles_documents"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_vehicles_documents"() IS 'Ensures documents with url have expiryDate and ocrData is an object when present.';



CREATE OR REPLACE FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trips t
    inner join public.drivers d on d.id = t.driver_id and d.user_id = auth.uid()
    where t.vehicle_id = p_vehicle_id
  );
$$;


ALTER FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") IS 'Used by vehicles RLS: driver can read vehicle on their trip. Scoped to auth.uid().';



CREATE OR REPLACE FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trips t
    inner join public.indents i on i.id = t.indent_id
    inner join public.organization_members om on om.organization_id = i.organization_id and om.user_id = auth.uid()
    where t.vehicle_id = p_vehicle_id
  );
$$;


ALTER FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") IS 'Used by vehicles RLS: indent owner can read vehicle of trip from their indent. Scoped to auth.uid().';



CREATE TABLE IF NOT EXISTS "public"."cash_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "description" "text",
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "entry_time" "text",
    "payment_method" "text",
    "contact_id" "uuid",
    "contact_name" "text",
    "contact_type" "text",
    "trip_id" "uuid",
    "indent_id" "uuid",
    "vehicle_number" "text",
    "driver_name" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "client_payment_confirmed_at" timestamp with time zone,
    "supplier_received_confirmed_at" timestamp with time zone,
    CONSTRAINT "cash_entries_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_entries_contact_type_check" CHECK (("contact_type" = ANY (ARRAY['client'::"text", 'supplier'::"text", 'driver'::"text"]))),
    CONSTRAINT "cash_entries_type_check" CHECK (("type" = ANY (ARRAY['cash_in'::"text", 'cash_out'::"text"])))
);


ALTER TABLE "public"."cash_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."cash_entries" IS 'All cash in/out ledger entries for finance tracking. Links to contacts (clients, suppliers, drivers), trips, and indents.';



COMMENT ON COLUMN "public"."cash_entries"."client_payment_confirmed_at" IS 'When the client confirmed they paid (for freight_payment entries).';



COMMENT ON COLUMN "public"."cash_entries"."supplier_received_confirmed_at" IS 'When the supplier confirmed they received settlement (for trip_settlement_paid entries).';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "text",
    "gst_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_person" "text",
    "gstin" "text",
    "pan_number" "text",
    "notes" "text",
    "is_integrated" boolean DEFAULT false,
    "credit_limit" numeric(12,2) DEFAULT 0,
    "payment_terms" "text" DEFAULT 'net_30'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "created_by" "uuid",
    "display_id" "text",
    "linked_organization_id" "uuid",
    CONSTRAINT "clients_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."contact_person" IS 'Primary contact person for the client organization';



COMMENT ON COLUMN "public"."clients"."gstin" IS 'GST Identification Number';



COMMENT ON COLUMN "public"."clients"."pan_number" IS 'Permanent Account Number';



COMMENT ON COLUMN "public"."clients"."notes" IS 'Additional notes about the client';



COMMENT ON COLUMN "public"."clients"."is_integrated" IS 'Whether the client is integrated with the platform';



COMMENT ON COLUMN "public"."clients"."credit_limit" IS 'Credit limit for the client';



COMMENT ON COLUMN "public"."clients"."payment_terms" IS 'Payment terms (e.g., net_30, net_60)';



COMMENT ON COLUMN "public"."clients"."status" IS 'Client status: active or inactive';



COMMENT ON COLUMN "public"."clients"."created_by" IS 'User who created this client record';



COMMENT ON COLUMN "public"."clients"."display_id" IS 'Human-readable client identifier';



COMMENT ON COLUMN "public"."clients"."linked_organization_id" IS 'When set, this client is on the platform (integrated); matches org created when they signed up.';



CREATE TABLE IF NOT EXISTS "public"."connection_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_organization_id" "uuid" NOT NULL,
    "to_organization_id" "uuid" NOT NULL,
    "request_shipper_client" boolean DEFAULT false NOT NULL,
    "request_carrier_supplier" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "responded_by" "uuid",
    CONSTRAINT "at_least_one_role" CHECK (("request_shipper_client" OR "request_carrier_supplier")),
    CONSTRAINT "connection_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."connection_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."connection_requests" IS 'Role-based connection: from_org invites to_org. request_shipper_client = they will give me loads; request_carrier_supplier = they will provide trucks. On approve, create organization_relations.';



COMMENT ON COLUMN "public"."connection_requests"."request_shipper_client" IS 'From_org wants to_org to give them loads (to_org will be shipper/client for from_org).';



COMMENT ON COLUMN "public"."connection_requests"."request_carrier_supplier" IS 'From_org wants to_org to provide trucks (to_org will be carrier/supplier for from_org).';



CREATE TABLE IF NOT EXISTS "public"."credit_debit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "indent_id" "uuid",
    "trip_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "reason" "text",
    "reference_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "credit_debit_notes_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "credit_debit_notes_indent_or_trip" CHECK ((("indent_id" IS NOT NULL) OR ("trip_id" IS NOT NULL))),
    CONSTRAINT "credit_debit_notes_type_check" CHECK (("type" = ANY (ARRAY['credit'::"text", 'debit'::"text"])))
);


ALTER TABLE "public"."credit_debit_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_debit_notes" IS 'Adjustments to receivables: credit = reduce receivable (e.g. overbilling correction), debit = increase (e.g. detention, extra charges).';



CREATE TABLE IF NOT EXISTS "public"."direct_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indent_id" "uuid" NOT NULL,
    "bidder_organization_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "driver_id" "uuid",
    "vehicle_id" "uuid",
    CONSTRAINT "direct_quotes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."direct_quotes" OWNER TO "postgres";


COMMENT ON TABLE "public"."direct_quotes" IS 'Quotes from suppliers on direct-circulation indents (no marketplace listing).';



COMMENT ON COLUMN "public"."direct_quotes"."driver_id" IS 'Driver assigned by bidder at quote time (same as marketplace bid).';



COMMENT ON COLUMN "public"."direct_quotes"."vehicle_id" IS 'Vehicle assigned by bidder at quote time (same as marketplace bid).';



CREATE TABLE IF NOT EXISTS "public"."driver_advances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "trip_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "driver_advances_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "driver_advances_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'deducted'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."driver_advances" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_advances" IS 'Advance paid to driver; deducted from trip settlement.';



CREATE TABLE IF NOT EXISTS "public"."driver_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_organization_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "responded_by" "uuid",
    "from_org_name" "text",
    "payable_amount" numeric(12,2),
    "commission_percent" numeric(5,2),
    "commission_per_km" numeric(10,2),
    "offer_details" "jsonb",
    CONSTRAINT "driver_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."driver_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_invites" IS 'Fleet owner invites driver (by phone). Driver sees under Invitations and can accept/reject. On accept, driver row is created in that org.';



COMMENT ON COLUMN "public"."driver_invites"."from_org_name" IS 'Display name of the organization that sent the invite (for driver UI).';



COMMENT ON COLUMN "public"."driver_invites"."payable_amount" IS 'Fixed payable/salary offer for the driver (e.g. monthly ₹).';



COMMENT ON COLUMN "public"."driver_invites"."commission_percent" IS 'Commission percentage offered to the driver.';



COMMENT ON COLUMN "public"."driver_invites"."commission_per_km" IS 'Per-km rate offered to the driver (₹/km).';



COMMENT ON COLUMN "public"."driver_invites"."offer_details" IS 'Offer terms as JSON: { payable_amount, commission_percent, commission_per_km }. Used when 070 columns are not present.';



CREATE TABLE IF NOT EXISTS "public"."driver_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "trip_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "balance_after" numeric(12,2),
    "description" "text",
    "reference_type" "text",
    "reference_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "driver_ledger_type_check" CHECK (("type" = ANY (ARRAY['advance'::"text", 'settlement'::"text", 'salary'::"text", 'reimbursement'::"text", 'adjustment'::"text", 'deduction'::"text"])))
);


ALTER TABLE "public"."driver_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_ledger" IS 'All driver financial entries: advance, settlement (trip completion), salary, reimbursement. Positive = credit to driver.';



CREATE TABLE IF NOT EXISTS "public"."driver_salary_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "note" "text",
    "trip_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "cash_entry_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "driver_salary_requests_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "driver_salary_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['monthly'::"text", 'advance'::"text", 'trip_based'::"text"]))),
    CONSTRAINT "driver_salary_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."driver_salary_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."driver_salary_requests" IS 'Driver requests salary from the org that assigned trips (supplier/fleet owner). Supplier can Accept & Pay or Reject.';



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "trip_id" "uuid",
    "category" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "description" "text",
    "expense_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indent_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indent_id" "uuid" NOT NULL,
    "stop_index" integer NOT NULL,
    "type" "text" NOT NULL,
    "area" "text" NOT NULL,
    "address" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "latitude" double precision,
    "longitude" double precision,
    CONSTRAINT "indent_stops_type_check" CHECK (("type" = ANY (ARRAY['pickup'::"text", 'drop'::"text"])))
);


ALTER TABLE "public"."indent_stops" OWNER TO "postgres";


COMMENT ON TABLE "public"."indent_stops" IS 'Ordered pickup/drop stops for an indent; when present used for full route display and for copying to trip_stops when creating a trip.';



COMMENT ON COLUMN "public"."indent_stops"."latitude" IS 'Resolved latitude when coordinates were fetched (e.g. from geocode) before save.';



COMMENT ON COLUMN "public"."indent_stops"."longitude" IS 'Resolved longitude when coordinates were fetched before save.';



CREATE TABLE IF NOT EXISTS "public"."indents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "indent_number" "text",
    "pickup_area" "text" NOT NULL,
    "drop_location" "text" NOT NULL,
    "client_id" "uuid",
    "client_name" "text" NOT NULL,
    "client_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "supplier_target" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_guaranteed" boolean DEFAULT false,
    "is_paid" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "vehicle_type" "text",
    "load_type" "text",
    "circulation_target" "text",
    "pickup_date" "date",
    "order_group_id" "uuid",
    "order_group_number" "text",
    "order_count" integer,
    "total_packages" integer,
    "assigned_supplier_id" "uuid",
    "assigned_driver_id" "uuid",
    "assigned_vehicle_id" "uuid",
    "distance" "text",
    "duration" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "client_organization_id" "uuid",
    "assigned_supplier_rate" numeric(12,2),
    "cancellation_penalty" numeric(12,2),
    "cancelled_at" timestamp with time zone,
    "sequence_number" integer,
    "display_indent_id" "text",
    CONSTRAINT "indents_circulation_target_check" CHECK (("circulation_target" = ANY (ARRAY['marketplace'::"text", 'integrated_supplier'::"text", 'offline'::"text", 'both'::"text"]))),
    CONSTRAINT "indents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'quoted'::"text", 'awarded'::"text", 'completed'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."indents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."indents"."client_organization_id" IS 'Platform org that is the load owner/client for this indent. When set, this org is excluded from seeing or bidding on this indent (margin integrity).';



COMMENT ON COLUMN "public"."indents"."assigned_supplier_rate" IS 'Agreed rate paid to assigned supplier (set when bid accepted). Used for supplier-perspective view only; never exposed to client.';



COMMENT ON COLUMN "public"."indents"."cancellation_penalty" IS 'Penalty amount when indent is cancelled after award (e.g. payable to supplier).';



COMMENT ON COLUMN "public"."indents"."cancelled_at" IS 'When the indent was cancelled (status = cancelled).';



COMMENT ON COLUMN "public"."indents"."sequence_number" IS 'Per-org sequence for display (IND001, IND002). Set by trigger on insert.';



COMMENT ON COLUMN "public"."indents"."display_indent_id" IS 'User-facing indent ID e.g. IND001. Set by trigger from sequence_number.';



CREATE OR REPLACE VIEW "public"."indents_client_perspective" WITH ("security_invoker"='on') AS
 SELECT "id",
    "organization_id",
    "indent_number",
    "pickup_area",
    "drop_location",
    "client_id",
    "client_name",
    "client_price",
    "client_organization_id",
    "status",
    "vehicle_type",
    "load_type",
    "pickup_date",
    "circulation_target",
    "created_at",
    "updated_at"
   FROM "public"."indents" "i";


ALTER VIEW "public"."indents_client_perspective" OWNER TO "postgres";


COMMENT ON VIEW "public"."indents_client_perspective" IS 'Client-safe columns only (no supplier rate). Use when API serves client org.';



CREATE OR REPLACE VIEW "public"."indents_supplier_perspective" AS
 SELECT "id",
    "organization_id",
    "indent_number",
    "pickup_area",
    "drop_location",
    "client_name",
    "assigned_supplier_id",
    "assigned_supplier_rate",
    "supplier_target",
    "status",
    "vehicle_type",
    "load_type",
    "pickup_date",
    "circulation_target",
    "created_at",
    "updated_at"
   FROM "public"."indents" "i";


ALTER VIEW "public"."indents_supplier_perspective" OWNER TO "postgres";


COMMENT ON VIEW "public"."indents_supplier_perspective" IS 'Supplier-safe columns only (no client_price). Use when API serves supplier org.';



CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    "description" "text",
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "weight" numeric(12,2) DEFAULT 0 NOT NULL,
    "dimensions" "text",
    "image_url" "text",
    "color" "text",
    "size" "text",
    "fragile" boolean DEFAULT false,
    "hsn_code" "text",
    "stock_quantity" integer DEFAULT 0 NOT NULL,
    "reorder_level" integer DEFAULT 0,
    "client_id" "uuid",
    "client_name" "text",
    "usage_count" integer DEFAULT 0 NOT NULL,
    "last_used_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_bids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "bidder_organization_id" "uuid" NOT NULL,
    "driver_id" "uuid",
    "vehicle_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "marketplace_bids_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."marketplace_bids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indent_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "marketplace_listings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'awarded'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."marketplace_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "weight" numeric(12,2) DEFAULT 0 NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "image_url" "text",
    "color" "text",
    "size" "text",
    "fragile" boolean DEFAULT false,
    "dimensions" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "dispatcher_order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "order_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text",
    "customer_phone" "text" NOT NULL,
    "merchant_name" "text",
    "merchant_id" "uuid",
    "service_type" "text" DEFAULT 'truck'::"text" NOT NULL,
    "pickup_address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "delivery_address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_multi_stop" boolean DEFAULT false NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "shipping_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivery_priority" "text" DEFAULT 'standard'::"text" NOT NULL,
    "estimated_delivery" timestamp with time zone,
    "actual_delivery" timestamp with time zone,
    "carrier" "text",
    "tracking_number" "text",
    "awb_number" "text",
    "courier_partner" "text",
    "assigned_trip_id" "uuid",
    "assigned_group_id" "text",
    "is_grouped" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "internal_notes" "text",
    CONSTRAINT "dispatcher_orders_delivery_priority_check" CHECK (("delivery_priority" = ANY (ARRAY['standard'::"text", 'express'::"text", 'same_day'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "dispatcher_orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'cancelled'::"text", 'cod'::"text"]))),
    CONSTRAINT "dispatcher_orders_service_type_check" CHECK (("service_type" = ANY (ARRAY['truck'::"text", 'courier'::"text"]))),
    CONSTRAINT "dispatcher_orders_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'pending'::"text", 'confirmed'::"text", 'picking'::"text", 'packed'::"text", 'dispatched'::"text", 'in_transit'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'cancelled'::"text", 'returned'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_display_sequences" (
    "organization_id" "uuid" NOT NULL,
    "trips_next" integer DEFAULT 1 NOT NULL,
    "indents_next" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."org_display_sequences" OWNER TO "postgres";


COMMENT ON TABLE "public"."org_display_sequences" IS 'Per-org sequence counters for display_trip_id (TRP###) and display_indent_id (IND###). O(1) per insert.';



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'driver'::"text"]))),
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'invited'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_organization_id" "uuid" NOT NULL,
    "to_organization_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'client_supplier'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_relations_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['client_supplier'::"text", 'supplier_client'::"text", 'broker_fleet'::"text"]))),
    CONSTRAINT "organization_relations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."organization_relations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_relations" IS 'Permanent client↔supplier (org↔org) links; optional for pre-approved / closed network. Operational link remains indent.assigned_supplier_id.';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "indent_id" "uuid",
    "trip_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "milestone_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_allocations_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payment_allocations_indent_or_trip" CHECK ((("indent_id" IS NOT NULL) OR ("trip_id" IS NOT NULL)))
);


ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_allocations" IS 'Allocation of a payment to indent(s)/trip(s). Sum of allocations per trip can drive trips.amount_paid or stay as audit.';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "from_organization_id" "uuid",
    "to_organization_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "payment_method" "text",
    "reference_number" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS 'Record of payment between orgs (e.g. client → indent creator, indent creator → supplier).';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "aggregated" boolean DEFAULT true NOT NULL,
    "asset" boolean DEFAULT true NOT NULL,
    "company_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_registration" "text",
    "license_photo_url" "text",
    "license_expiry" "date",
    "insurance_photo_url" "text",
    "insurance_expiry" "date",
    "vehicle_registration_photo_url" "text",
    "vehicle_registration_expiry" "date",
    "bio" "text",
    "address" "text",
    "license_number" "text",
    "license_type" "text",
    "years_of_experience" integer,
    "languages" "text"[] DEFAULT '{}'::"text"[],
    "preferred_vehicle_types" "text"[] DEFAULT '{}'::"text"[],
    "preferred_areas" "text"[] DEFAULT '{}'::"text"[],
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'driver'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."role" IS 'Signup role: user (org user) or driver only';



COMMENT ON COLUMN "public"."profiles"."aggregated" IS 'Organization user: dispatcher/aggregated view (indents, marketplace, combined fleet)';



COMMENT ON COLUMN "public"."profiles"."asset" IS 'Organization user: asset/fleet view (my fleet, vehicles, drivers). Toggle in settings.';



COMMENT ON COLUMN "public"."profiles"."vehicle_registration" IS 'Driver: vehicle registration number';



COMMENT ON COLUMN "public"."profiles"."license_photo_url" IS 'Driver: driving license document photo URL (storage)';



COMMENT ON COLUMN "public"."profiles"."license_expiry" IS 'Driver: license expiry date';



COMMENT ON COLUMN "public"."profiles"."insurance_photo_url" IS 'Driver: insurance document photo URL';



COMMENT ON COLUMN "public"."profiles"."insurance_expiry" IS 'Driver: insurance expiry date';



COMMENT ON COLUMN "public"."profiles"."vehicle_registration_photo_url" IS 'Driver: RC/vehicle registration document photo URL';



COMMENT ON COLUMN "public"."profiles"."vehicle_registration_expiry" IS 'Driver: vehicle registration document expiry date';



COMMENT ON COLUMN "public"."profiles"."bio" IS 'Short bio; used by both drivers and org users';



COMMENT ON COLUMN "public"."profiles"."address" IS 'Primary address';



COMMENT ON COLUMN "public"."profiles"."license_number" IS 'Driver: driving license number';



COMMENT ON COLUMN "public"."profiles"."license_type" IS 'Driver: license class/type';



COMMENT ON COLUMN "public"."profiles"."years_of_experience" IS 'Driver: years of experience';



COMMENT ON COLUMN "public"."profiles"."languages" IS 'Driver: spoken languages';



COMMENT ON COLUMN "public"."profiles"."preferred_vehicle_types" IS 'Driver: preferred vehicle types';



COMMENT ON COLUMN "public"."profiles"."preferred_areas" IS 'Driver: preferred routes/areas';



COMMENT ON COLUMN "public"."profiles"."emergency_contact_name" IS 'Driver: emergency contact name';



COMMENT ON COLUMN "public"."profiles"."emergency_contact_phone" IS 'Driver: emergency contact phone';



CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "linked_organization_id" "uuid",
    "company_name" "text",
    "contact_person" "text",
    "email" "text",
    "address" "text",
    "gst_number" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "specialization" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "operating_areas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "vehicle_types" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "supplier_type" "text" DEFAULT 'offline'::"text",
    CONSTRAINT "suppliers_supplier_type_check" CHECK (("supplier_type" = ANY (ARRAY['integrated'::"text", 'offline'::"text", 'marketplace'::"text"])))
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."suppliers"."linked_organization_id" IS 'When set, this supplier is on the platform (integrated); matches org created when they signed up.';



COMMENT ON COLUMN "public"."suppliers"."company_name" IS 'Company / business name';



COMMENT ON COLUMN "public"."suppliers"."contact_person" IS 'Primary contact name';



COMMENT ON COLUMN "public"."suppliers"."supplier_type" IS 'integrated | offline | marketplace';



CREATE TABLE IF NOT EXISTS "public"."trip_assignment_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "driver_id_prev" "uuid",
    "driver_id_new" "uuid",
    "driver_name_prev" "text",
    "driver_name_new" "text",
    "vehicle_id_prev" "uuid",
    "vehicle_id_new" "uuid",
    "vehicle_number_prev" "text",
    "vehicle_number_new" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid",
    CONSTRAINT "trip_assignment_audit_event_type_check" CHECK (("event_type" = ANY (ARRAY['assignment'::"text", 'reassignment'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."trip_assignment_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."trip_assignment_audit" IS 'Per-trip audit: assignment, reassignment, and completion with timestamp and optional actor.';



CREATE TABLE IF NOT EXISTS "public"."trip_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "uploaded_by" "uuid"
);


ALTER TABLE "public"."trip_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."trip_documents" IS 'Metadata for files stored in trip-documents bucket; one row per file.';



CREATE TABLE IF NOT EXISTS "public"."trip_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "changed_by" "uuid"
);


ALTER TABLE "public"."trip_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "stop_index" integer NOT NULL,
    "type" "text" NOT NULL,
    "address" "text" NOT NULL,
    "client_name" "text",
    "notes" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trip_stops_type_check" CHECK (("type" = ANY (ARRAY['pickup'::"text", 'dropoff'::"text"])))
);


ALTER TABLE "public"."trip_stops" OWNER TO "postgres";


COMMENT ON TABLE "public"."trip_stops" IS 'Ordered pickup/dropoff stops for a trip; when present used instead of trips.pickup_area/drop_location for driver map';



CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "trip_number" "text",
    "indent_id" "uuid",
    "source" "text" NOT NULL,
    "pickup_area" "text" NOT NULL,
    "drop_location" "text" NOT NULL,
    "distance" "text",
    "estimated_duration" "text",
    "client_id" "uuid",
    "client_name" "text" NOT NULL,
    "supplier_id" "uuid",
    "driver_id" "uuid",
    "vehicle_id" "uuid",
    "client_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "supplier_rate" numeric(12,2) DEFAULT 0 NOT NULL,
    "margin" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "driver_commission" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_guaranteed" boolean DEFAULT false,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "pickup_date" "date",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "load_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "at_pickup_at" timestamp with time zone,
    "current_stop_index" integer DEFAULT 0 NOT NULL,
    "payment_due_date" "date",
    "cancellation_fee" numeric(12,2),
    "cancellation_settlement_at" timestamp with time zone,
    "sequence_number" integer,
    "display_trip_id" "text",
    "driver_display_name" "text",
    "vehicle_display_number" "text",
    CONSTRAINT "trips_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'paid'::"text"]))),
    CONSTRAINT "trips_source_check" CHECK (("source" = ANY (ARRAY['marketplace'::"text", 'integrated'::"text", 'offline'::"text", 'direct'::"text", 'manual'::"text"]))),
    CONSTRAINT "trips_status_check" CHECK (("status" = ANY (ARRAY['pending_acceptance'::"text", 'assigned'::"text", 'in_transit'::"text", 'at_pickup'::"text", 'loading'::"text", 'at_drop'::"text", 'unloading'::"text", 'completed'::"text", 'cancelled'::"text", 'active'::"text", 'in_progress'::"text"])))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


COMMENT ON COLUMN "public"."trips"."status" IS 'pending_acceptance = assigned to driver, waiting for driver to accept; assigned = driver accepted; then in_transit etc.';



COMMENT ON COLUMN "public"."trips"."at_pickup_at" IS 'When driver marked arrival at pickup (step 2 of 4)';



COMMENT ON COLUMN "public"."trips"."current_stop_index" IS 'Index of current stop (0-based) for multi-stop trips; driver app uses this for map and panels';



COMMENT ON COLUMN "public"."trips"."payment_due_date" IS 'Due date for client payment; used for reminders and overdue reporting.';



COMMENT ON COLUMN "public"."trips"."cancellation_fee" IS 'Fee paid/received when trip is cancelled after award (e.g. partial compensation to supplier).';



COMMENT ON COLUMN "public"."trips"."cancellation_settlement_at" IS 'When cancellation was financially settled.';



COMMENT ON COLUMN "public"."trips"."sequence_number" IS 'Per-org sequence for display (TRP001, TRP002). Set by trigger on insert.';



COMMENT ON COLUMN "public"."trips"."display_trip_id" IS 'User-facing trip ID e.g. TRP001. Set by trigger from sequence_number.';



COMMENT ON COLUMN "public"."trips"."driver_display_name" IS 'Cached driver name for display (e.g. Trips table for indent creator). Kept in sync by trigger.';



COMMENT ON COLUMN "public"."trips"."vehicle_display_number" IS 'Cached vehicle number for display. Kept in sync by trigger.';



CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "vehicle_number" "text" NOT NULL,
    "vehicle_type" "text",
    "capacity" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "type" "text" DEFAULT 'owned'::"text" NOT NULL,
    "assigned_driver_id" "uuid",
    "supplier_id" "uuid",
    "supplier_name" "text",
    "supplier_phone" "text",
    "documents" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "vehicle_brand" "text",
    "vehicle_model" "text",
    "vehicle_body_type" "text",
    "vehicle_size" "text",
    "vehicle_axle" "text",
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'maintenance'::"text"]))),
    CONSTRAINT "vehicles_type_check" CHECK (("type" = ANY (ARRAY['owned'::"text", 'adhoc'::"text"])))
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."vehicles"."vehicle_brand" IS 'Make e.g. Tata, Ashok Leyland';



COMMENT ON COLUMN "public"."vehicles"."vehicle_model" IS 'Model e.g. Signa 2823.K, Dost Strong';



COMMENT ON COLUMN "public"."vehicles"."vehicle_body_type" IS 'Body type e.g. Tipper, Cargo, Haulage';



COMMENT ON COLUMN "public"."vehicles"."vehicle_size" IS 'Size e.g. 16m³ / 18m³, 28ft / 32ft';



COMMENT ON COLUMN "public"."vehicles"."vehicle_axle" IS 'Axle config e.g. 6x4, 4x2';



CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['credit'::"text", 'debit'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wallets_owner" CHECK ((("organization_id" IS NOT NULL) OR ("user_id" IS NOT NULL)))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connection_requests"
    ADD CONSTRAINT "connection_requests_from_organization_id_to_organization_id_key" UNIQUE ("from_organization_id", "to_organization_id");



ALTER TABLE ONLY "public"."connection_requests"
    ADD CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_debit_notes"
    ADD CONSTRAINT "credit_debit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_indent_id_bidder_organization_id_key" UNIQUE ("indent_id", "bidder_organization_id");



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "dispatcher_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "dispatcher_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "dispatcher_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_advances"
    ADD CONSTRAINT "driver_advances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_invites"
    ADD CONSTRAINT "driver_invites_from_organization_id_to_user_id_key" UNIQUE ("from_organization_id", "to_user_id");



ALTER TABLE ONLY "public"."driver_invites"
    ADD CONSTRAINT "driver_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_ledger"
    ADD CONSTRAINT "driver_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_salary_requests"
    ADD CONSTRAINT "driver_salary_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indent_stops"
    ADD CONSTRAINT "indent_stops_indent_id_stop_index_key" UNIQUE ("indent_id", "stop_index");



ALTER TABLE ONLY "public"."indent_stops"
    ADD CONSTRAINT "indent_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_bids"
    ADD CONSTRAINT "marketplace_bids_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_display_sequences"
    ADD CONSTRAINT "org_display_sequences_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_relations"
    ADD CONSTRAINT "organization_relations_from_organization_id_to_organization_key" UNIQUE ("from_organization_id", "to_organization_id", "relation_type");



ALTER TABLE ONLY "public"."organization_relations"
    ADD CONSTRAINT "organization_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_documents"
    ADD CONSTRAINT "trip_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_documents"
    ADD CONSTRAINT "trip_documents_storage_path_unique" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."trip_status_history"
    ADD CONSTRAINT "trip_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_stops"
    ADD CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_stops"
    ADD CONSTRAINT "trip_stops_trip_id_stop_index_key" UNIQUE ("trip_id", "stop_index");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_cash_entries_category" ON "public"."cash_entries" USING "btree" ("category");



CREATE INDEX "idx_cash_entries_contact" ON "public"."cash_entries" USING "btree" ("contact_id");



CREATE INDEX "idx_cash_entries_created" ON "public"."cash_entries" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_cash_entries_date" ON "public"."cash_entries" USING "btree" ("entry_date" DESC);



CREATE INDEX "idx_cash_entries_indent" ON "public"."cash_entries" USING "btree" ("indent_id");



CREATE INDEX "idx_cash_entries_org" ON "public"."cash_entries" USING "btree" ("organization_id");



CREATE INDEX "idx_cash_entries_trip" ON "public"."cash_entries" USING "btree" ("trip_id");



CREATE INDEX "idx_cash_entries_type" ON "public"."cash_entries" USING "btree" ("type");



CREATE INDEX "idx_clients_linked_org" ON "public"."clients" USING "btree" ("linked_organization_id");



CREATE INDEX "idx_clients_org" ON "public"."clients" USING "btree" ("organization_id");



CREATE INDEX "idx_connection_requests_from" ON "public"."connection_requests" USING "btree" ("from_organization_id");



CREATE INDEX "idx_connection_requests_status" ON "public"."connection_requests" USING "btree" ("status");



CREATE INDEX "idx_connection_requests_to" ON "public"."connection_requests" USING "btree" ("to_organization_id");



CREATE INDEX "idx_credit_debit_notes_created" ON "public"."credit_debit_notes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_credit_debit_notes_indent" ON "public"."credit_debit_notes" USING "btree" ("indent_id");



CREATE INDEX "idx_credit_debit_notes_org" ON "public"."credit_debit_notes" USING "btree" ("organization_id");



CREATE INDEX "idx_credit_debit_notes_trip" ON "public"."credit_debit_notes" USING "btree" ("trip_id");



CREATE INDEX "idx_direct_quotes_bidder" ON "public"."direct_quotes" USING "btree" ("bidder_organization_id");



CREATE INDEX "idx_direct_quotes_indent" ON "public"."direct_quotes" USING "btree" ("indent_id");



CREATE INDEX "idx_driver_advances_driver" ON "public"."driver_advances" USING "btree" ("driver_id");



CREATE INDEX "idx_driver_advances_org" ON "public"."driver_advances" USING "btree" ("organization_id");



CREATE INDEX "idx_driver_advances_status" ON "public"."driver_advances" USING "btree" ("status");



CREATE INDEX "idx_driver_advances_trip" ON "public"."driver_advances" USING "btree" ("trip_id");



CREATE INDEX "idx_driver_invites_from" ON "public"."driver_invites" USING "btree" ("from_organization_id");



CREATE INDEX "idx_driver_invites_status" ON "public"."driver_invites" USING "btree" ("status");



CREATE INDEX "idx_driver_invites_to" ON "public"."driver_invites" USING "btree" ("to_user_id");



CREATE INDEX "idx_driver_ledger_created" ON "public"."driver_ledger" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_driver_ledger_driver" ON "public"."driver_ledger" USING "btree" ("driver_id");



CREATE INDEX "idx_driver_ledger_org" ON "public"."driver_ledger" USING "btree" ("organization_id");



CREATE INDEX "idx_driver_ledger_trip" ON "public"."driver_ledger" USING "btree" ("trip_id");



CREATE INDEX "idx_driver_ledger_type" ON "public"."driver_ledger" USING "btree" ("type");



CREATE INDEX "idx_driver_salary_requests_created" ON "public"."driver_salary_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_driver_salary_requests_driver" ON "public"."driver_salary_requests" USING "btree" ("driver_id");



CREATE INDEX "idx_driver_salary_requests_org" ON "public"."driver_salary_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_driver_salary_requests_status" ON "public"."driver_salary_requests" USING "btree" ("status");



CREATE INDEX "idx_drivers_org" ON "public"."drivers" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_drivers_org_user_unique" ON "public"."drivers" USING "btree" ("organization_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_drivers_status" ON "public"."drivers" USING "btree" ("status");



CREATE INDEX "idx_expenses_org" ON "public"."expenses" USING "btree" ("organization_id");



CREATE INDEX "idx_expenses_trip" ON "public"."expenses" USING "btree" ("trip_id");



CREATE INDEX "idx_indent_stops_coords" ON "public"."indent_stops" USING "btree" ("indent_id") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "idx_indent_stops_indent_id" ON "public"."indent_stops" USING "btree" ("indent_id");



CREATE INDEX "idx_indents_assigned_supplier" ON "public"."indents" USING "btree" ("assigned_supplier_id") WHERE ("assigned_supplier_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_indents_assigned_supplier" IS 'Supplier org can efficiently list indents assigned to them.';



CREATE INDEX "idx_indents_circulation_status" ON "public"."indents" USING "btree" ("circulation_target", "status") WHERE ("circulation_target" = ANY (ARRAY['marketplace'::"text", 'both'::"text"]));



CREATE INDEX "idx_indents_client" ON "public"."indents" USING "btree" ("client_id");



CREATE INDEX "idx_indents_client_organization" ON "public"."indents" USING "btree" ("client_organization_id") WHERE ("client_organization_id" IS NOT NULL);



CREATE INDEX "idx_indents_org" ON "public"."indents" USING "btree" ("organization_id");



CREATE INDEX "idx_indents_pickup_date" ON "public"."indents" USING "btree" ("pickup_date");



CREATE INDEX "idx_indents_status" ON "public"."indents" USING "btree" ("status");



CREATE INDEX "idx_inventory_active" ON "public"."inventory" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_inventory_category" ON "public"."inventory" USING "btree" ("category");



CREATE INDEX "idx_inventory_org" ON "public"."inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_inventory_sku" ON "public"."inventory" USING "btree" ("organization_id", "sku");



CREATE INDEX "idx_marketplace_bids_bidder" ON "public"."marketplace_bids" USING "btree" ("bidder_organization_id");



CREATE INDEX "idx_marketplace_bids_listing" ON "public"."marketplace_bids" USING "btree" ("listing_id");



CREATE INDEX "idx_marketplace_listings_indent" ON "public"."marketplace_listings" USING "btree" ("indent_id");



CREATE INDEX "idx_marketplace_listings_status" ON "public"."marketplace_listings" USING "btree" ("status");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_org" ON "public"."orders" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_orders_org_order_number" ON "public"."orders" USING "btree" ("organization_id", "order_number");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_org_display_sequences_updated" ON "public"."org_display_sequences" USING "btree" ("updated_at");



CREATE INDEX "idx_org_members_org" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_org_members_user" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_organization_relations_from" ON "public"."organization_relations" USING "btree" ("from_organization_id");



CREATE INDEX "idx_organization_relations_status" ON "public"."organization_relations" USING "btree" ("status");



CREATE INDEX "idx_organization_relations_to" ON "public"."organization_relations" USING "btree" ("to_organization_id");



CREATE INDEX "idx_organizations_owner" ON "public"."organizations" USING "btree" ("owner_id");



CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");



CREATE INDEX "idx_payment_allocations_indent" ON "public"."payment_allocations" USING "btree" ("indent_id");



CREATE INDEX "idx_payment_allocations_payment" ON "public"."payment_allocations" USING "btree" ("payment_id");



CREATE INDEX "idx_payment_allocations_trip" ON "public"."payment_allocations" USING "btree" ("trip_id");



CREATE INDEX "idx_payments_date" ON "public"."payments" USING "btree" ("payment_date" DESC);



CREATE INDEX "idx_payments_from_org" ON "public"."payments" USING "btree" ("from_organization_id");



CREATE INDEX "idx_payments_org" ON "public"."payments" USING "btree" ("organization_id");



CREATE INDEX "idx_payments_to_org" ON "public"."payments" USING "btree" ("to_organization_id");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_suppliers_linked_org" ON "public"."suppliers" USING "btree" ("linked_organization_id");



CREATE INDEX "idx_suppliers_org" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_trip_assignment_audit_changed_at" ON "public"."trip_assignment_audit" USING "btree" ("trip_id", "changed_at" DESC);



CREATE INDEX "idx_trip_assignment_audit_trip_id" ON "public"."trip_assignment_audit" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_documents_trip_id" ON "public"."trip_documents" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_status_history_trip" ON "public"."trip_status_history" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_stops_trip_id" ON "public"."trip_stops" USING "btree" ("trip_id");



CREATE INDEX "idx_trips_driver" ON "public"."trips" USING "btree" ("driver_id");



CREATE INDEX "idx_trips_indent" ON "public"."trips" USING "btree" ("indent_id");



CREATE INDEX "idx_trips_org" ON "public"."trips" USING "btree" ("organization_id");



CREATE INDEX "idx_trips_payment_due_date" ON "public"."trips" USING "btree" ("payment_due_date") WHERE ("payment_due_date" IS NOT NULL);



CREATE INDEX "idx_trips_pickup_date" ON "public"."trips" USING "btree" ("pickup_date");



CREATE INDEX "idx_trips_status" ON "public"."trips" USING "btree" ("status");



CREATE INDEX "idx_trips_vehicle" ON "public"."trips" USING "btree" ("vehicle_id");



CREATE INDEX "idx_vehicles_driver" ON "public"."vehicles" USING "btree" ("assigned_driver_id");



CREATE INDEX "idx_vehicles_org" ON "public"."vehicles" USING "btree" ("organization_id");



CREATE INDEX "idx_vehicles_status" ON "public"."vehicles" USING "btree" ("status");



CREATE INDEX "idx_wallet_tx_created" ON "public"."wallet_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_tx_wallet" ON "public"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallets_org" ON "public"."wallets" USING "btree" ("organization_id");



CREATE INDEX "idx_wallets_user" ON "public"."wallets" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "cash_entries_updated_at" BEFORE UPDATE ON "public"."cash_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "credit_debit_notes_updated_at" BEFORE UPDATE ON "public"."credit_debit_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "direct_quotes_updated_at" BEFORE UPDATE ON "public"."direct_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "driver_advances_updated_at" BEFORE UPDATE ON "public"."driver_advances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "driver_salary_requests_updated_at" BEFORE UPDATE ON "public"."driver_salary_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "drivers_updated_at" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "indents_set_display_id_trigger" BEFORE INSERT ON "public"."indents" FOR EACH ROW EXECUTE FUNCTION "public"."indents_set_display_id"();



CREATE OR REPLACE TRIGGER "indents_updated_at" BEFORE UPDATE ON "public"."indents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_updated_at"();



CREATE OR REPLACE TRIGGER "marketplace_bids_updated_at" BEFORE UPDATE ON "public"."marketplace_bids" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "on_profile_created_link_drivers" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."link_drivers_on_driver_profile_created"();



COMMENT ON TRIGGER "on_profile_created_link_drivers" ON "public"."profiles" IS 'After driver profile insert: link existing drivers (email/phone safe), ensure one driver row in Driver Pool.';



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_updated_at"();



CREATE OR REPLACE TRIGGER "organization_members_updated_at" BEFORE UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organization_relations_updated_at" BEFORE UPDATE ON "public"."organization_relations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_indent_client_name_trigger" BEFORE INSERT OR UPDATE OF "client_id", "client_name" ON "public"."indents" FOR EACH ROW EXECUTE FUNCTION "public"."sync_indent_client_name"();



CREATE OR REPLACE TRIGGER "sync_trip_client_name_trigger" BEFORE INSERT OR UPDATE OF "client_id", "client_name" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."sync_trip_client_name"();



CREATE OR REPLACE TRIGGER "trg_bid_accepted_set_indent_supplier" AFTER UPDATE OF "status" ON "public"."marketplace_bids" FOR EACH ROW WHEN (("new"."status" = 'accepted'::"text")) EXECUTE FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"();



CREATE OR REPLACE TRIGGER "trg_connection_request_approved" AFTER UPDATE OF "status" ON "public"."connection_requests" FOR EACH ROW EXECUTE FUNCTION "public"."on_connection_request_approved"();



CREATE OR REPLACE TRIGGER "trg_driver_invites_set_from_org_name" BEFORE INSERT ON "public"."driver_invites" FOR EACH ROW EXECUTE FUNCTION "public"."set_driver_invite_from_org_name"();



CREATE OR REPLACE TRIGGER "trg_indent_ensure_marketplace_listing" AFTER INSERT OR UPDATE OF "circulation_target" ON "public"."indents" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_marketplace_listing_for_indent"();



CREATE OR REPLACE TRIGGER "trg_link_clients_suppliers_on_org_created" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."link_clients_suppliers_on_org_created"();



CREATE OR REPLACE TRIGGER "trg_marketplace_bids_bidder_not_client" BEFORE INSERT ON "public"."marketplace_bids" FOR EACH ROW EXECUTE FUNCTION "public"."check_bidder_not_indent_client"();



CREATE OR REPLACE TRIGGER "trg_quote_accepted_set_indent_supplier" AFTER UPDATE OF "status" ON "public"."direct_quotes" FOR EACH ROW WHEN (("new"."status" = 'accepted'::"text")) EXECUTE FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"();



CREATE OR REPLACE TRIGGER "trigger_generate_client_display_id" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."generate_client_display_id"();



CREATE OR REPLACE TRIGGER "trips_set_display_id_trigger" BEFORE INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."trips_set_display_id"();



CREATE OR REPLACE TRIGGER "trips_sync_driver_vehicle_display" BEFORE INSERT OR UPDATE OF "driver_id", "vehicle_id" ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."trips_sync_driver_vehicle_display"();



CREATE OR REPLACE TRIGGER "trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "validate_vehicles_documents_trigger" BEFORE INSERT OR UPDATE OF "documents" ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_vehicles_documents"();



CREATE OR REPLACE TRIGGER "vehicles_updated_at" BEFORE UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "wallets_updated_at" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_linked_organization_id_fkey" FOREIGN KEY ("linked_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_requests"
    ADD CONSTRAINT "connection_requests_from_organization_id_fkey" FOREIGN KEY ("from_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_requests"
    ADD CONSTRAINT "connection_requests_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."connection_requests"
    ADD CONSTRAINT "connection_requests_to_organization_id_fkey" FOREIGN KEY ("to_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_debit_notes"
    ADD CONSTRAINT "credit_debit_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_debit_notes"
    ADD CONSTRAINT "credit_debit_notes_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_debit_notes"
    ADD CONSTRAINT "credit_debit_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_debit_notes"
    ADD CONSTRAINT "credit_debit_notes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_bidder_organization_id_fkey" FOREIGN KEY ("bidder_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_quotes"
    ADD CONSTRAINT "direct_quotes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "dispatcher_inventory_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "dispatcher_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "dispatcher_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "dispatcher_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_advances"
    ADD CONSTRAINT "driver_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_advances"
    ADD CONSTRAINT "driver_advances_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_advances"
    ADD CONSTRAINT "driver_advances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_advances"
    ADD CONSTRAINT "driver_advances_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_invites"
    ADD CONSTRAINT "driver_invites_from_organization_id_fkey" FOREIGN KEY ("from_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_invites"
    ADD CONSTRAINT "driver_invites_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_invites"
    ADD CONSTRAINT "driver_invites_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_ledger"
    ADD CONSTRAINT "driver_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_ledger"
    ADD CONSTRAINT "driver_ledger_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_ledger"
    ADD CONSTRAINT "driver_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_ledger"
    ADD CONSTRAINT "driver_ledger_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_salary_requests"
    ADD CONSTRAINT "driver_salary_requests_cash_entry_id_fkey" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_salary_requests"
    ADD CONSTRAINT "driver_salary_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_salary_requests"
    ADD CONSTRAINT "driver_salary_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_salary_requests"
    ADD CONSTRAINT "driver_salary_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "fk_drivers_assigned_vehicle" FOREIGN KEY ("assigned_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "fk_vehicles_assigned_driver" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "fk_vehicles_supplier" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indent_stops"
    ADD CONSTRAINT "indent_stops_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_assigned_supplier_id_fkey" FOREIGN KEY ("assigned_supplier_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_assigned_vehicle_id_fkey" FOREIGN KEY ("assigned_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_client_organization_id_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."indents"
    ADD CONSTRAINT "indents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_bids"
    ADD CONSTRAINT "marketplace_bids_bidder_organization_id_fkey" FOREIGN KEY ("bidder_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_bids"
    ADD CONSTRAINT "marketplace_bids_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_bids"
    ADD CONSTRAINT "marketplace_bids_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_bids"
    ADD CONSTRAINT "marketplace_bids_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_display_sequences"
    ADD CONSTRAINT "org_display_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_relations"
    ADD CONSTRAINT "organization_relations_from_organization_id_fkey" FOREIGN KEY ("from_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_relations"
    ADD CONSTRAINT "organization_relations_to_organization_id_fkey" FOREIGN KEY ("to_organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_from_organization_id_fkey" FOREIGN KEY ("from_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_to_organization_id_fkey" FOREIGN KEY ("to_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_linked_organization_id_fkey" FOREIGN KEY ("linked_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_driver_id_new_fkey" FOREIGN KEY ("driver_id_new") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_driver_id_prev_fkey" FOREIGN KEY ("driver_id_prev") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_vehicle_id_new_fkey" FOREIGN KEY ("vehicle_id_new") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_assignment_audit"
    ADD CONSTRAINT "trip_assignment_audit_vehicle_id_prev_fkey" FOREIGN KEY ("vehicle_id_prev") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_documents"
    ADD CONSTRAINT "trip_documents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_documents"
    ADD CONSTRAINT "trip_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_status_history"
    ADD CONSTRAINT "trip_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_status_history"
    ADD CONSTRAINT "trip_status_history_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_stops"
    ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "public"."indents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Assigned supplier org can read indents assigned to them" ON "public"."indents" FOR SELECT USING ((("assigned_supplier_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "indents"."assigned_supplier_id") AND ("om"."user_id" = "auth"."uid"()))))));



COMMENT ON POLICY "Assigned supplier org can read indents assigned to them" ON "public"."indents" IS 'Supplier org members can see indents they were assigned to (e.g. after winning a bid).';



CREATE POLICY "Assigned supplier org can update indents assigned to them" ON "public"."indents" FOR UPDATE USING ((("assigned_supplier_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "indents"."assigned_supplier_id") AND ("om"."user_id" = "auth"."uid"()))))));



COMMENT ON POLICY "Assigned supplier org can update indents assigned to them" ON "public"."indents" IS 'Supplier org can update indent (e.g. status, trip assignment) when they are the assigned supplier.';



CREATE POLICY "Authenticated can read active listings" ON "public"."marketplace_listings" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("status" = 'active'::"text")));



CREATE POLICY "Authenticated users can create organization" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Bidders can insert own direct quotes" ON "public"."direct_quotes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "direct_quotes"."bidder_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Bidders can manage own bids" ON "public"."marketplace_bids" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "marketplace_bids"."bidder_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Bidders can select own direct quotes" ON "public"."direct_quotes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "direct_quotes"."bidder_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Bidders can update own direct quotes" ON "public"."direct_quotes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "direct_quotes"."bidder_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Driver can read own driver_invites" ON "public"."driver_invites" FOR SELECT USING (("to_user_id" = "auth"."uid"()));



CREATE POLICY "Driver can update own driver_invites" ON "public"."driver_invites" FOR UPDATE USING (("to_user_id" = "auth"."uid"()));



CREATE POLICY "Drivers can insert own driver_salary_requests" ON "public"."driver_salary_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."drivers" "d"
  WHERE (("d"."id" = "driver_salary_requests"."driver_id") AND ("d"."user_id" = "auth"."uid"())))));



CREATE POLICY "Drivers can read org names for invites they received" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."driver_invites" "di"
  WHERE (("di"."to_user_id" = "auth"."uid"()) AND ("organizations"."id" = "di"."from_organization_id")))));



COMMENT ON POLICY "Drivers can read org names for invites they received" ON "public"."organizations" IS 'Allows a driver to read id/name of organizations that sent them a driver_invite (so Invitations UI shows correct fleet name).';



CREATE POLICY "Drivers can read own driver_salary_requests" ON "public"."driver_salary_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."drivers" "d"
  WHERE (("d"."id" = "driver_salary_requests"."driver_id") AND ("d"."user_id" = "auth"."uid"())))));



CREATE POLICY "Drivers can read own ledger" ON "public"."driver_ledger" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."drivers" "d"
  WHERE (("d"."id" = "driver_ledger"."driver_id") AND ("d"."user_id" = "auth"."uid"())))));



CREATE POLICY "Drivers can read own row" ON "public"."drivers" FOR SELECT USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "Drivers can read own row" ON "public"."drivers" IS 'Allows integrated drivers (user_id set) to read their driver record without requiring organization_members';



CREATE POLICY "Drivers can read their linked organization" ON "public"."organizations" FOR SELECT USING ("public"."user_has_driver_linked_to_org"("id"));



COMMENT ON POLICY "Drivers can read their linked organization" ON "public"."organizations" IS 'Allows a driver to read id/name of the organization they are linked to (drivers.organization_id) for Fleet Network / Integrated Fleet Owner display.';



CREATE POLICY "Drivers can read vehicle on their assigned trip" ON "public"."vehicles" FOR SELECT USING ("public"."vehicle_assigned_to_current_driver_trip"("id"));



COMMENT ON POLICY "Drivers can read vehicle on their assigned trip" ON "public"."vehicles" IS 'Allows integrated drivers to read the vehicle row when it is embedded in trip update/select (e.g. trip completion).';



CREATE POLICY "Drivers can select stops of their trips" ON "public"."trip_stops" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."drivers" "d" ON ((("d"."id" = "t"."driver_id") AND ("d"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_stops"."trip_id"))));



CREATE POLICY "Drivers can select their own trips" ON "public"."trips" FOR SELECT USING ((("driver_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."drivers" "d"
  WHERE (("d"."id" = "trips"."driver_id") AND ("d"."user_id" = "auth"."uid"()))))));



COMMENT ON POLICY "Drivers can select their own trips" ON "public"."trips" IS 'Allows integrated drivers (with user_id set) to read trips assigned to them via their driver record';



CREATE POLICY "Drivers can update own row" ON "public"."drivers" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "Drivers can update own row" ON "public"."drivers" IS 'Allows integrated drivers to update their own record (e.g. status for online/offline toggle)';



CREATE POLICY "Drivers can update their own trips" ON "public"."trips" FOR UPDATE USING ((("driver_id" IS NOT NULL) AND "public"."driver_id_belongs_to_user"("driver_id", "auth"."uid"()))) WITH CHECK ((("driver_id" IS NOT NULL) AND "public"."driver_id_belongs_to_user"("driver_id", "auth"."uid"())));



COMMENT ON POLICY "Drivers can update their own trips" ON "public"."trips" IS 'Allows integrated drivers to update progress (status, started_at, completed_at) on trips assigned to them';



CREATE POLICY "From-org can manage own connection_requests" ON "public"."connection_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "connection_requests"."from_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "From-org can manage own driver_invites" ON "public"."driver_invites" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_invites"."from_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "From-org members can manage organization_relations where from_o" ON "public"."organization_relations" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_relations"."from_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Indent owner can manage trip documents" ON "public"."trip_documents" USING ((EXISTS ( SELECT 1
   FROM (("public"."trips" "t"
     JOIN "public"."indents" "i" ON (("i"."id" = "t"."indent_id")))
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_documents"."trip_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."trips" "t"
     JOIN "public"."indents" "i" ON (("i"."id" = "t"."indent_id")))
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_documents"."trip_id"))));



CREATE POLICY "Indent owner can read driver of trip from their indent" ON "public"."drivers" FOR SELECT USING ("public"."driver_on_trip_from_indent_owned_by_current_user"("id"));



COMMENT ON POLICY "Indent owner can read driver of trip from their indent" ON "public"."drivers" IS 'Allows indent creator to read driver name for trips from their indents (e.g. Trips table Vehicle/Driver columns).';



CREATE POLICY "Indent owner can read vehicle of trip from their indent" ON "public"."vehicles" FOR SELECT USING ("public"."vehicle_on_trip_from_indent_owned_by_current_user"("id"));



COMMENT ON POLICY "Indent owner can read vehicle of trip from their indent" ON "public"."vehicles" IS 'Allows indent creator to read vehicle number for trips from their indents (e.g. Trips table Vehicle/Driver columns).';



CREATE POLICY "Indent owner can select trip" ON "public"."trips" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "trips"."indent_id"))));



COMMENT ON POLICY "Indent owner can select trip" ON "public"."trips" IS 'Allows org members to read trips where their org created the indent (creator view).';



CREATE POLICY "Indent owners can read quotes on their indents" ON "public"."direct_quotes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "direct_quotes"."indent_id"))));



CREATE POLICY "Indent owners can update quotes on their indents" ON "public"."direct_quotes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "direct_quotes"."indent_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "direct_quotes"."indent_id"))));



CREATE POLICY "Integrated supplier can see connected client indents" ON "public"."indents" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("circulation_target" = ANY (ARRAY['integrated_supplier'::"text", 'both'::"text"])) AND ("status" = ANY (ARRAY['pending'::"text", 'quoted'::"text", 'awarded'::"text"])) AND (EXISTS ( SELECT 1
   FROM ("public"."organization_relations" "r"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "r"."to_organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE (("r"."from_organization_id" = "indents"."organization_id") AND ("r"."to_organization_id" = "om"."organization_id") AND ("r"."relation_type" = 'client_supplier'::"text") AND ("r"."status" = 'active'::"text"))))));



COMMENT ON POLICY "Integrated supplier can see connected client indents" ON "public"."indents" IS 'Get Load: supplier org sees indents from clients who added them (client_supplier), when circulation is integrated_supplier or both.';



CREATE POLICY "Listing owners can read bids on their listings" ON "public"."marketplace_bids" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."marketplace_listings" "ml"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "ml"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("ml"."id" = "marketplace_bids"."listing_id"))));



CREATE POLICY "Listing owners can update bids on their listings" ON "public"."marketplace_bids" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."marketplace_listings" "ml"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "ml"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("ml"."id" = "marketplace_bids"."listing_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."marketplace_listings" "ml"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "ml"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("ml"."id" = "marketplace_bids"."listing_id"))));



CREATE POLICY "Marketplace indents visible to all authenticated" ON "public"."indents" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("circulation_target" = ANY (ARRAY['marketplace'::"text", 'both'::"text"])) AND ("status" = ANY (ARRAY['pending'::"text", 'quoted'::"text", 'awarded'::"text"]))));



COMMENT ON POLICY "Marketplace indents visible to all authenticated" ON "public"."indents" IS 'Get Load: other orgs can see indents marked marketplace/both (open for bidding or awarded)';



CREATE POLICY "Members can read own organizations" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organizations"."id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can insert trip assignment audit" ON "public"."trip_assignment_audit" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_assignment_audit"."trip_id"))));



CREATE POLICY "Org members can insert trip history" ON "public"."trip_status_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_status_history"."trip_id"))));



CREATE POLICY "Org members can manage cash_entries" ON "public"."cash_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "cash_entries"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "cash_entries"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage clients" ON "public"."clients" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "clients"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage credit_debit_notes" ON "public"."credit_debit_notes" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "credit_debit_notes"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage driver_advances" ON "public"."driver_advances" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_advances"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_advances"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage driver_ledger" ON "public"."driver_ledger" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_ledger"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_ledger"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage driver_salary_requests" ON "public"."driver_salary_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_salary_requests"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "driver_salary_requests"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage drivers" ON "public"."drivers" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "drivers"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage expenses" ON "public"."expenses" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "expenses"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage indent stops" ON "public"."indent_stops" USING ((EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "indent_stops"."indent_id"))));



CREATE POLICY "Org members can manage indents" ON "public"."indents" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "indents"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage inventory" ON "public"."inventory" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "inventory"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "inventory"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage order_items" ON "public"."order_items" USING ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "o"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("o"."id" = "order_items"."order_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "o"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("o"."id" = "order_items"."order_id"))));



CREATE POLICY "Org members can manage orders" ON "public"."orders" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "orders"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "orders"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage own listings" ON "public"."marketplace_listings" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "marketplace_listings"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage payment_allocations" ON "public"."payment_allocations" USING (((EXISTS ( SELECT 1
   FROM ("public"."payments" "p"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "p"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("p"."id" = "payment_allocations"."payment_id"))) OR (("indent_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "payment_allocations"."indent_id")))) OR (("trip_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "payment_allocations"."trip_id")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."payments" "p"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "p"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("p"."id" = "payment_allocations"."payment_id"))) OR (("indent_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."indents" "i"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("i"."id" = "payment_allocations"."indent_id")))) OR (("trip_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "payment_allocations"."trip_id"))))));



CREATE POLICY "Org members can manage payments where org is party" ON "public"."payments" USING ((("organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1)) OR ("from_organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1)) OR ("to_organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1)))) WITH CHECK ((("organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1)) OR ("from_organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1)) OR ("to_organization_id" = ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())
 LIMIT 1))));



CREATE POLICY "Org members can manage suppliers" ON "public"."suppliers" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "suppliers"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage trip documents" ON "public"."trip_documents" USING ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_documents"."trip_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_documents"."trip_id"))));



CREATE POLICY "Org members can manage trip stops" ON "public"."trip_stops" USING ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_stops"."trip_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_stops"."trip_id"))));



COMMENT ON POLICY "Org members can manage trip stops" ON "public"."trip_stops" IS 'Org members can select/insert/update/delete stops for trips belonging to their organization';



CREATE POLICY "Org members can manage trips" ON "public"."trips" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "trips"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage vehicles" ON "public"."vehicles" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "vehicles"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can read own org display sequences" ON "public"."org_display_sequences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "org_display_sequences"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can read trip assignment audit" ON "public"."trip_assignment_audit" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_assignment_audit"."trip_id"))));



CREATE POLICY "Org members can read trip history" ON "public"."trip_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("t"."id" = "trip_status_history"."trip_id"))));



CREATE POLICY "Org members can update org wallet" ON "public"."wallets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "wallets"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owners can read own organization" ON "public"."organizations" FOR SELECT USING (("owner_id" = "auth"."uid"()));



COMMENT ON POLICY "Owners can read own organization" ON "public"."organizations" IS 'Allows reading organization when current user is owner; used by getOrganizationsForUser fallback so Connections/Network show.';



CREATE POLICY "Owners can update own organization" ON "public"."organizations" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "To-org can read and update connection_requests to them" ON "public"."connection_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "connection_requests"."to_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "To-org can update connection_requests to them" ON "public"."connection_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "connection_requests"."to_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "To-org members can read organization_relations where to_org" ON "public"."organization_relations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_relations"."to_organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert wallet for self or org" ON "public"."wallets" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "wallets"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can read org names for connection request parties" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."connection_requests" "cr"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "cr"."from_organization_id") OR ("om"."organization_id" = "cr"."to_organization_id"))))
  WHERE (("om"."user_id" = "auth"."uid"()) AND (("organizations"."id" = "cr"."from_organization_id") OR ("organizations"."id" = "cr"."to_organization_id"))))));



COMMENT ON POLICY "Users can read org names for connection request parties" ON "public"."organizations" IS 'Allows reading organization id/name for from_org and to_org of any connection request where the user is a member of one of the parties (so Connections UI can show correct names).';



CREATE POLICY "Users can read own or org wallet" ON "public"."wallets" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "wallets"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Wallet owners can insert transactions" ON "public"."wallet_transactions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wallets" "w"
  WHERE (("w"."id" = "wallet_transactions"."wallet_id") AND (("w"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."organization_members" "om"
          WHERE (("om"."organization_id" = "w"."organization_id") AND ("om"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Wallet owners can read transactions" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wallets" "w"
  WHERE (("w"."id" = "wallet_transactions"."wallet_id") AND (("w"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."organization_members" "om"
          WHERE (("om"."organization_id" = "w"."organization_id") AND ("om"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Winning bidder can mark indent completed" ON "public"."indents" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."marketplace_listings" "ml"
     JOIN "public"."marketplace_bids" "mb" ON ((("mb"."listing_id" = "ml"."id") AND ("mb"."status" = 'accepted'::"text"))))
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "mb"."bidder_organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE ("ml"."indent_id" = "indents"."id")))) WITH CHECK (("status" = 'completed'::"text"));



CREATE POLICY "allow_all_for_authenticated_users" ON "public"."organization_members" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."cash_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connection_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_debit_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."direct_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_advances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_salary_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."indent_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."indents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_bids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_display_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_relations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners_read_own_organization" ON "public"."organizations" FOR SELECT USING (("owner_id" = "auth"."uid"()));



COMMENT ON POLICY "owners_read_own_organization" ON "public"."organizations" IS 'Allows a user to read organizations they own, so the app can show the org and create missing organization_members.';



ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_assignment_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_driver_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."attach_driver_by_contact"("p_driver_id" "uuid", "p_phone" "text", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_bidder_not_indent_client"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_bidder_not_indent_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_bidder_not_indent_client"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detach_driver"("p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."detach_driver"("p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detach_driver"("p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatcher_inventory_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."dispatcher_inventory_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatcher_inventory_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatcher_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."dispatcher_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatcher_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."driver_id_belongs_to_user"("p_driver_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."driver_on_trip_from_indent_owned_by_current_user"("p_driver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_marketplace_listing_for_indent"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_marketplace_listing_for_indent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_marketplace_listing_for_indent"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_client_display_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_client_display_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_client_display_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_connection_request_by_id_with_names"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_connection_requests_received_with_names"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_connection_requests_sent_with_names"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_direct_quotes_with_bidder_names"("p_indent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_driver_invitee_by_phone"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_driver_invites_received"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_driver_invites_received"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_driver_invites_received"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_driver_linked_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_driver_linked_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_driver_linked_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_indent_for_viewer"("p_indent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitee_by_phone"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_marketplace_bids_with_bidder_names"("p_listing_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_indent_sequence"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_trip_sequence"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_id_by_invitee_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_organizations_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_organizations_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organizations_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."indents_set_display_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."indents_set_display_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."indents_set_display_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."inventory_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."inventory_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inventory_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_clients_suppliers_on_org_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_clients_suppliers_on_org_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_clients_suppliers_on_org_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_drivers_on_driver_profile_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_drivers_on_driver_profile_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_drivers_on_driver_profile_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_connection_request_approved"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_connection_request_approved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_connection_request_approved"() TO "service_role";



GRANT ALL ON FUNCTION "public"."orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_driver_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_driver_invite_from_org_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_driver_invite_from_org_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_driver_invite_from_org_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_bid_accepted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_indent_assigned_supplier_on_quote_accepted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_indent_client_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_indent_client_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_indent_client_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_trip_client_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_trip_client_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_trip_client_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trips_set_display_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trips_set_display_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trips_set_display_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trips_sync_driver_vehicle_display"() TO "anon";
GRANT ALL ON FUNCTION "public"."trips_sync_driver_vehicle_display"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trips_sync_driver_vehicle_display"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_driver_linked_to_org"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_vehicles_documents"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_vehicles_documents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_vehicles_documents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicle_assigned_to_current_driver_trip"("p_vehicle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicle_on_trip_from_indent_owned_by_current_user"("p_vehicle_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."cash_entries" TO "anon";
GRANT ALL ON TABLE "public"."cash_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_entries" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."connection_requests" TO "anon";
GRANT ALL ON TABLE "public"."connection_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."connection_requests" TO "service_role";



GRANT ALL ON TABLE "public"."credit_debit_notes" TO "anon";
GRANT ALL ON TABLE "public"."credit_debit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_debit_notes" TO "service_role";



GRANT ALL ON TABLE "public"."direct_quotes" TO "anon";
GRANT ALL ON TABLE "public"."direct_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."driver_advances" TO "anon";
GRANT ALL ON TABLE "public"."driver_advances" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_advances" TO "service_role";



GRANT ALL ON TABLE "public"."driver_invites" TO "anon";
GRANT ALL ON TABLE "public"."driver_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_invites" TO "service_role";



GRANT ALL ON TABLE "public"."driver_ledger" TO "anon";
GRANT ALL ON TABLE "public"."driver_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."driver_salary_requests" TO "anon";
GRANT ALL ON TABLE "public"."driver_salary_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_salary_requests" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."indent_stops" TO "anon";
GRANT ALL ON TABLE "public"."indent_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."indent_stops" TO "service_role";



GRANT ALL ON TABLE "public"."indents" TO "anon";
GRANT ALL ON TABLE "public"."indents" TO "authenticated";
GRANT ALL ON TABLE "public"."indents" TO "service_role";



GRANT ALL ON TABLE "public"."indents_client_perspective" TO "anon";
GRANT ALL ON TABLE "public"."indents_client_perspective" TO "authenticated";
GRANT ALL ON TABLE "public"."indents_client_perspective" TO "service_role";



GRANT ALL ON TABLE "public"."indents_supplier_perspective" TO "anon";
GRANT ALL ON TABLE "public"."indents_supplier_perspective" TO "authenticated";
GRANT ALL ON TABLE "public"."indents_supplier_perspective" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_bids" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_bids" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_bids" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_listings" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."org_display_sequences" TO "anon";
GRANT ALL ON TABLE "public"."org_display_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."org_display_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organization_relations" TO "anon";
GRANT ALL ON TABLE "public"."organization_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_relations" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."trip_assignment_audit" TO "anon";
GRANT ALL ON TABLE "public"."trip_assignment_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_assignment_audit" TO "service_role";



GRANT ALL ON TABLE "public"."trip_documents" TO "anon";
GRANT ALL ON TABLE "public"."trip_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_documents" TO "service_role";



GRANT ALL ON TABLE "public"."trip_status_history" TO "anon";
GRANT ALL ON TABLE "public"."trip_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."trip_stops" TO "anon";
GRANT ALL ON TABLE "public"."trip_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_stops" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE POLICY "Drivers can delete own documents" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'driver-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "Drivers can read own documents" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'driver-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "Drivers can update own documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'driver-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."jwt"() ->> 'sub'::"text")))) WITH CHECK ((("bucket_id" = 'driver-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "Drivers can upload own documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'driver-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "Indent owner can manage trip document files" ON "storage"."objects" USING ((("bucket_id" = 'trip-documents'::"text") AND (EXISTS ( SELECT 1
   FROM (("public"."trips" "t"
     JOIN "public"."indents" "i" ON (("i"."id" = "t"."indent_id")))
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE (("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]))))) WITH CHECK ((("bucket_id" = 'trip-documents'::"text") AND (EXISTS ( SELECT 1
   FROM (("public"."trips" "t"
     JOIN "public"."indents" "i" ON (("i"."id" = "t"."indent_id")))
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "i"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE (("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1])))));



CREATE POLICY "Org members can delete vehicle documents" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("om"."organization_id")::"text" AS "organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can manage trip document files" ON "storage"."objects" USING ((("bucket_id" = 'trip-documents'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE (("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]))))) WITH CHECK ((("bucket_id" = 'trip-documents'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."trips" "t"
     JOIN "public"."organization_members" "om" ON ((("om"."organization_id" = "t"."organization_id") AND ("om"."user_id" = "auth"."uid"()))))
  WHERE (("t"."id")::"text" = ("storage"."foldername"("objects"."name"))[1])))));



CREATE POLICY "Org members can read vehicle documents" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("om"."organization_id")::"text" AS "organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can update vehicle documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'vehicle-documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("om"."organization_id")::"text" AS "organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"()))))) WITH CHECK ((("bucket_id" = 'vehicle-documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("om"."organization_id")::"text" AS "organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "Org members can upload vehicle documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'vehicle-documents'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("om"."organization_id")::"text" AS "organization_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."user_id" = "auth"."uid"())))));

-- Seed: Driver Pool organization (required for driver signup / link_drivers_on_driver_profile_created).
INSERT INTO public.organizations (id, name, slug, owner_id)
VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, 'Driver Pool', 'driver-pool', NULL)
ON CONFLICT (id) DO NOTHING;


