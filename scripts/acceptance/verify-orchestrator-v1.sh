#!/usr/bin/env bash
# Integration acceptance verification for ExecutionOrchestrator v1 (linked DB).
# Usage: ./scripts/acceptance/verify-orchestrator-v1.sh <order_id> [organization_id]
set -euo pipefail

ORDER_ID="${1:-}"
ORG_ID="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -z "$ORDER_ID" ]]; then
  echo "Usage: $0 <order_id> [organization_id]"
  exit 1
fi

query() {
  supabase db query "$1" --linked -o table
}

echo ""
echo "══════════════════════════════════════════════════════════════"
echo " ExecutionOrchestrator v1 — DB verification"
echo " Order ID: $ORDER_ID"
echo "══════════════════════════════════════════════════════════════"

echo ""
echo "── Stage 2: Sales order ──"
query "
SELECT id, order_number, organization_id, customer_id, pickup_warehouse_id, status, created_at
FROM public.sales_orders
WHERE id = '$ORDER_ID' AND deleted_at IS NULL;
"

echo ""
echo "── Stage 3: Linked indent(s) ──"
query "
SELECT id, organization_id, sales_order_id, status, client_name, created_at
FROM public.indents
WHERE sales_order_id = '$ORDER_ID' AND deleted_at IS NULL;
"

echo ""
echo "── Stage 3: Duplicate indent guard ──"
query "
SELECT sales_order_id, organization_id, count(*) AS indent_count
FROM public.indents
WHERE sales_order_id = '$ORDER_ID' AND deleted_at IS NULL
GROUP BY sales_order_id, organization_id
HAVING count(*) > 1;
"

echo ""
echo "── Stage 4: Data lineage (order → indent) ──"
query "
SELECT
  so.id AS order_id,
  so.order_number,
  so.status AS order_status,
  so.organization_id,
  i.id AS indent_id,
  i.sales_order_id,
  i.status AS indent_status
FROM public.sales_orders so
LEFT JOIN public.indents i
  ON i.sales_order_id = so.id AND i.deleted_at IS NULL
WHERE so.id = '$ORDER_ID' AND so.deleted_at IS NULL;
"

if [[ -n "$ORG_ID" ]]; then
  echo ""
  echo "── Stage 1: Master data (org scope) ──"
  query "
  SELECT c.id AS customer_id, c.name AS customer_name,
         w.id AS warehouse_id, w.name AS warehouse_name
  FROM public.clients c
  LEFT JOIN public.client_warehouses w
    ON w.client_id = c.id AND w.deleted_at IS NULL
  WHERE c.organization_id = '$ORG_ID' AND c.deleted_at IS NULL
  ORDER BY c.created_at DESC, w.created_at DESC
  LIMIT 10;
  "
fi

echo ""
echo "── Orphan indent check (global) ──"
query "
SELECT i.id, i.organization_id, i.sales_order_id
FROM public.indents i
LEFT JOIN public.sales_orders s ON s.id = i.sales_order_id
WHERE s.id IS NULL AND i.deleted_at IS NULL;
"

echo ""
echo "Done. Expected: order status Planned, exactly one indent row, 0 duplicate/orphan rows."
echo "Event payload verification (Stage 5) is in-memory — use Commerce publish trace or:"
echo "  getPlatformEventLogByCorrelationId(correlationId)"
echo ""
