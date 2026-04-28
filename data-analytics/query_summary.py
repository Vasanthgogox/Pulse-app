from __future__ import annotations

from base import get_admin_client


def print_table_counts() -> None:
    client = get_admin_client()

    tables = [
        "profiles",
        "organizations",
        "organization_members",
        "trips",
        "drivers",
        "vehicles",
    ]

    print("DB Summary")
    print("-" * 32)

    for table in tables:
        response = client.table(table).select("*", count="exact").limit(1).execute()
        count = response.count if response.count is not None else 0
        print(f"{table:24} {count}")


if __name__ == "__main__":
    print_table_counts()
