# Network / Marketplace Domain

## Overview
Social + load board layer. Dispatchers post loads (indents), other orgs bid. Includes org follows and connection requests.

## Files
- Services: `features/network/services/`
- Screen: `app/(tabs)/network.tsx` (or similar)

## Tables
- `indents` — load board posts
- `network_posts` — social posts
- `network_bids` — bids on posts/indents
- `network_follows` — org follows

## Realtime
`useRealtimeNetworkInvalidation()` — subscribes to `connection_requests` for approval transitions.
Invalidates: clients, suppliers, connection request lists on approval.

## Capabilities Required
- `marketplace_post` — create indents/posts
- `marketplace_bid` — bid on loads
- Asset-based orgs: both
- Non-asset orgs: post only
