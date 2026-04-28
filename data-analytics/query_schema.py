from __future__ import annotations

import requests

from base import get_service_role_key, get_supabase_url


def print_tables_and_columns() -> None:
    url = f"{get_supabase_url().rstrip('/')}/rest/v1/"
    key = get_service_role_key()

    response = requests.get(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/openapi+json",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()

    # PostgREST currently serves Swagger 2.0 docs ("definitions"), not OpenAPI 3 ("components.schemas").
    schemas = (
        (payload.get("components") or {}).get("schemas")
        or payload.get("definitions")
        or {}
    )
    if not schemas:
        print("No tables/columns found.")
        return

    print("Public schema tables and columns")
    print("=" * 40)

    for table_name in sorted(schemas.keys()):
        print(f"\n{table_name}")
        print("-" * len(table_name))
        properties = (schemas[table_name] or {}).get("properties") or {}
        for column_name in sorted(properties.keys()):
            prop = properties[column_name] or {}
            data_type = (
                prop.get("type")
                or prop.get("format")
                or prop.get("$ref")
                or "unknown"
            )
            print(f"- {column_name} ({data_type})")


if __name__ == "__main__":
    print_tables_and_columns()
