-- Add 'lr' (Lorry Receipt) to the allowed document types for trip_documents.
ALTER TABLE public.trip_documents
  DROP CONSTRAINT IF EXISTS trip_documents_type_check;

ALTER TABLE public.trip_documents
  ADD CONSTRAINT trip_documents_type_check
  CHECK (
    document_type = ANY (
      ARRAY[
        'manifest'::text,
        'pod'::text,
        'invoice'::text,
        'eway_bill'::text,
        'loading_slip'::text,
        'odometer_start_photo'::text,
        'odometer_end_photo'::text,
        'fuel_bill_photo'::text,
        'toll_receipt_photo'::text,
        'trip_expense_receipt_photo'::text,
        'lr'::text
      ]
    )
  );
