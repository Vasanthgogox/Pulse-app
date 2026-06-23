# Database — Core Tables

RLS enforced on all tables via `organization_id`. No `service_role` key in app.
Migrations: `supabase/migrations/` — always add new incremental files, never edit existing ones.

## profiles
Extends `auth.users`.
```
id (= auth.users.id), full_name, avatar_url, avatar_seed
role: "user" | "driver"
phone, company_name, status_text
```

## organizations
Multi-tenant root. `org_members` is M:M join to profiles.
```
org_members: organization_id, profile_id, role: owner|admin|member
```

## drivers / clients / suppliers / vehicles
Entity master tables, all scoped to `organization_id`.

## chat_messages
Realtime trip chat.

## trip_documents / pod_documents
Storage references (signed URLs).

## Key Relationships
- Trip → Client, Supplier, Driver, Vehicle (all optional)
- Transaction → Trip (optional), Contact (driver/client/supplier)
- OrgMember → Organization + Profile (M:M)
- Indent → Organization (creator), Trip (if matched)
