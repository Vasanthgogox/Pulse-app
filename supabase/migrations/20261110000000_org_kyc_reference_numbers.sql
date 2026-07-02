-- Workspace KYC panel and getWorkspaceKyc select msme/tan/iec on organizations,
-- but the columns were only ever added to clients/suppliers — the missing columns
-- made every organizations KYC select fail with 400.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS msme_number text,
  ADD COLUMN IF NOT EXISTS tan_number  text,
  ADD COLUMN IF NOT EXISTS iec_number  text;

COMMENT ON COLUMN public.organizations.msme_number IS 'MSME/Udyam Registration Number';
COMMENT ON COLUMN public.organizations.tan_number  IS 'Tax Deduction and Collection Account Number';
COMMENT ON COLUMN public.organizations.iec_number  IS 'Importer Exporter Code';
