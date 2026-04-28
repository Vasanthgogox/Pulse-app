# Data Analytics (Python)

Use this folder for ad-hoc DB queries, summaries, and analytics scripts from CLI.

## Setup

```bash
cd data-analytics
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

No separate env file is required here.

`base.py` automatically loads the repo root `.env` and uses:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Run the sample summary

```bash
cd data-analytics
source .venv/bin/activate
python query_summary.py
```

## Get all tables and columns

```bash
cd data-analytics
source .venv/bin/activate
python query_schema.py
```

## Reuse in new scripts

```python
from base import get_admin_client, get_anon_client

admin = get_admin_client()  # service role (bypasses RLS)
anon = get_anon_client()    # anon key (RLS applies)
```

Create more files in this folder and import from `base.py`.
