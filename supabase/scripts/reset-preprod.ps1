# Reset preprod to use only supabase/migrations/20250227120000_initial_schema.sql
#
# Prerequisites:
#   1. This repo is linked to preprod: npx supabase link --project-ref <ref>
#
# Steps:
#   1. In Supabase Dashboard (preprod): Project Settings -> General -> Reset database. Confirm.
#      (This wipes all schema and data; required so CREATE TABLE in the migration can run.)
#   2. Run this script from repo root: .\supabase\scripts\reset-preprod.ps1
#      It marks old remote migration versions as reverted, then pushes 20250227120000_initial_schema.sql.
#
$ErrorActionPreference = "Stop"
$versions = @(
  "001","002","003","004","005","006","007","008","009","010",
  "011","012","013","014","015","016","017","018","019","020",
  "021","022","023","024","025","026","027","028","029","030",
  "031","032","033","034","035","036","037","038","039","040",
  "041","042","043","044","045","046","047","048","049","050",
  "051","052","053","054","055","056","057","058","059","060",
  "061","062","063","064","065","066","067","069","070","071",
  "072","073","074","075","076","077","078","079","080","081",
  "082","083","085","086","087",
  "20260216151000","20260218120000","20260218130100","20260218140000","20260218150000",
  "20260219120000","20260219130000","20260219140000","20260220100000","20260220101000","20260220102000","20260225130000"
)
Write-Host "Repairing migration history (marking remote versions as reverted)..."
& npx supabase migration repair --status reverted $versions
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Pushing migration 20250227120000_initial_schema.sql to linked remote..."
& npx supabase db push --linked --yes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Preprod now has only the initial schema from 20250227120000_initial_schema.sql"
