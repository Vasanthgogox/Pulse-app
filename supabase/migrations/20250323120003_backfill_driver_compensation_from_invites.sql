-- Backfill compensation fields from driver_invites to drivers for accepted invites.
-- Kept as a separate migration so existing schema migration remains unchanged.

UPDATE drivers d
SET
    payable_amount = i.payable_amount,
    commission_percent = i.commission_percent,
    commission_per_km = i.commission_per_km
FROM driver_invites i
WHERE
    d.user_id = i.to_user_id
    AND d.organization_id = i.from_organization_id
    AND i.status = 'accepted'
    AND d.user_id IS NOT NULL
    AND (
        d.payable_amount IS NULL
        OR d.commission_percent IS NULL
        OR d.commission_per_km IS NULL
    );
