-- Missing indexes for chat performance (claudeaudit.md P1)
CREATE INDEX IF NOT EXISTS idx_trips_org_trip_number ON trips(organization_id, trip_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_linked_organization_id ON suppliers(linked_organization_id);
CREATE INDEX IF NOT EXISTS idx_direct_quotes_indent_status_bidder ON direct_quotes(indent_id, status, bidder_organization_id);
