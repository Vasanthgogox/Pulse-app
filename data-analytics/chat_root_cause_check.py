from __future__ import annotations

from base import get_admin_client


def main() -> None:
    client = get_admin_client()

    print("Trip chat root-cause diagnostic")
    print("-" * 48)

    profiles = (
        client.table("profiles")
        .select("id,full_name,email,company_name")
        .or_(
            "full_name.ilike.%nihas%,full_name.ilike.%mukunt%,"
            "email.ilike.%nihas%,email.ilike.%mukunt%,"
            "company_name.ilike.%nihas%,company_name.ilike.%mukunt%"
        )
        .limit(50)
        .execute()
        .data
        or []
    )
    print("\nProfiles (nihas/mukunt):")
    for p in profiles:
        print(p)

    user_ids = [p["id"] for p in profiles if p.get("id")]
    memberships = (
        client.table("organization_members")
        .select("user_id,organization_id,role,status")
        .in_("user_id", user_ids)
        .execute()
        .data
        or []
    )
    print("\nOrganization memberships:")
    for m in memberships:
        print(m)

    org_ids = sorted({m["organization_id"] for m in memberships})
    orgs = (
        client.table("organizations")
        .select("id,name")
        .in_("id", org_ids)
        .execute()
        .data
        or []
    )
    org_name_by_id = {o["id"]: o["name"] for o in orgs}
    print("\nOrganizations:")
    for o in orgs:
        print(o)

    trip_refs = ["TRP022", "TRP004", "TRP003", "TRP001"]
    trip_ids: list[str] = []
    print("\nTrips by reference:")
    for ref in trip_refs:
        rows = (
            client.table("trips")
            .select(
                "id,organization_id,trip_number,status,client_id,supplier_id,driver_id,created_at"
            )
            .eq("trip_number", ref)
            .execute()
            .data
            or []
        )
        if not rows:
            continue
        print(f"\n{ref}:")
        for row in rows:
            print({**row, "organization_name": org_name_by_id.get(row["organization_id"])})
            trip_ids.append(row["id"])

    if not trip_ids:
        print("\nNo matching trips found.")
        return

    conversations = (
        client.table("trip_conversations")
        .select(
            "id,organization_id,trip_id,party_type,party_name,last_message_at,last_message_preview"
        )
        .in_("trip_id", trip_ids)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )

    print("\nTrip conversations for those trips:")
    for conv in conversations:
        print({**conv, "organization_name": org_name_by_id.get(conv["organization_id"])})

    conv_ids = [c["id"] for c in conversations]
    if conv_ids:
        messages = (
            client.table("trip_messages")
            .select(
                "id,conversation_id,organization_id,sender_role,sender_name,content,created_at"
            )
            .in_("conversation_id", conv_ids)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )
        print("\nMessages in those conversations:")
        for msg in messages:
            print(msg)

    print("\nConclusion hint:")
    print(
        "- If messages exist only under sender org conversation rows and no counterpart "
        "conversation/message exists under receiver org, root cause is missing cross-org mirroring."
    )


if __name__ == "__main__":
    main()
