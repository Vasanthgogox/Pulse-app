from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client


ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"


def _load_env() -> None:
    if not ENV_PATH.exists():
        raise FileNotFoundError(f".env not found at: {ENV_PATH}")
    load_dotenv(dotenv_path=ENV_PATH, override=False)


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env variable: {name}")
    return value.strip()


@lru_cache(maxsize=1)
def get_supabase_url() -> str:
    _load_env()
    return _get_required_env("EXPO_PUBLIC_SUPABASE_URL")


@lru_cache(maxsize=1)
def get_anon_key() -> str:
    _load_env()
    return _get_required_env("EXPO_PUBLIC_SUPABASE_ANON_KEY")


@lru_cache(maxsize=1)
def get_service_role_key() -> str:
    _load_env()
    return _get_required_env("SUPABASE_SERVICE_ROLE_KEY")


@lru_cache(maxsize=1)
def get_anon_client() -> Client:
    return create_client(get_supabase_url(), get_anon_key())


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    return create_client(get_supabase_url(), get_service_role_key())
