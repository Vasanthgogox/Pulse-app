# Trip documents (POD) – RLS and storage policies

When a **supplier** sees "JPG · Pending" in the Driver POD preview despite the driver having uploaded the POD, the usual cause is **Row Level Security (RLS)** or **storage policies**: the supplier’s user is not allowed to read `trip_documents` rows or objects in the `trip-documents` bucket for that trip.

**Migration:** `supabase/migrations/20260313120000_add_trip_documents_pod_policies.sql` in this repo adds the supplier policies (table + storage). Apply with `supabase db push` (or `supabase db reset` for local). Alternatively run the SQL in Supabase Dashboard → SQL Editor.

---

## 1. Table RLS: `trip_documents`

The app queries `trip_documents` by `trip_id` (indexed). Suppliers must be able to **SELECT** rows for trips where they are the assigned supplier.

**Option A – Supplier is the authenticated user**  
If `trips.supplier_id` stores the supplier’s user id (`auth.uid()`):

```sql
-- Suppliers can view trip documents for trips assigned to them
CREATE POLICY "Suppliers can view trip documents"
ON public.trip_documents
FOR SELECT
TO authenticated
USING (
  trip_id IN (
    SELECT id FROM public.trips WHERE supplier_id = auth.uid()
  )
);
```

**Option B – Org-based access**  
If only org members (dispatcher/fleet) can see trips and suppliers are identified via org/profile, keep or add a policy that allows SELECT for users who can already see the trip (e.g. same `organization_id` or via `profiles`). For example, allow anyone who can read the trip to read its documents:

```sql
-- Org members can view trip documents for trips they can read
CREATE POLICY "Org members can view trip documents"
ON public.trip_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    JOIN public.profiles p ON p.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
    AND p.id = auth.uid()
  )
);
```

Adjust the join to match your actual `profiles` / `trips` schema. Ensure **suppliers** (when they are the trip’s `supplier_id`) are included in the set of users who can read that trip, or add a separate policy like Option A.

---

## 2. Storage: `trip-documents` bucket

The app stores PODs in bucket **`trip-documents`**, path **`{trip_id}/{uuid}.{ext}`**. Preview uses **signed URLs**; the client needs to be allowed to read objects under the trip’s folder.

Add a **SELECT** policy so that users who can read the trip can read objects whose path starts with that trip’s id:

```sql
-- Allow read for objects under a trip folder if the user can see that trip
CREATE POLICY "Users can read trip documents for their trips"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.trips
      WHERE supplier_id = auth.uid()
      -- Or use the same EXISTS / org logic as in table RLS
    )
  )
);
```

If you use org-based trip access, replace the subquery with the same condition as in your `trip_documents` SELECT policy (e.g. trip id in the set of trips the user’s org can see).

---

## 3. Summary

| Layer        | Requirement |
|-------------|-------------|
| **Table**   | RLS on `trip_documents` must allow **SELECT** for the trip’s supplier (and/or org members who can see the trip). |
| **Storage** | RLS on `storage.objects` for bucket `trip-documents` must allow **SELECT** for paths under `{trip_id}/` when the user is allowed to see that trip. |

After applying these, the app’s O(n) fetch (DB by `trip_id` + optional storage list fallback) and signed URL preview will work for suppliers when the driver has uploaded the POD.
