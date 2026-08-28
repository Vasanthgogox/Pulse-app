-- Let drivers/dispatchers record the LR (Lorry Receipt) number when uploading
-- the LR document. Previously only the file itself could be attached, with no
-- way to enter the printed LR number alongside it.
--
-- Scoped to the 'lr' document_type only (per product decision) and optional
-- (not required to complete the upload), matching the existing "Document
-- number" pattern already used for owner vehicle documents
-- (features/driver/components/OwnerVehicleDocumentsSection.tsx).

ALTER TABLE public.trip_documents
  ADD COLUMN IF NOT EXISTS document_number text;

COMMENT ON COLUMN public.trip_documents.document_number IS
  'Optional user-entered document number (e.g. the printed LR number). '
  'Currently only populated for document_type = ''lr''.';
