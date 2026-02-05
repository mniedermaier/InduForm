"""Rate limiting configuration for InduForm API."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_rate_limit_enabled = os.environ.get("INDUFORM_RATE_LIMIT_ENABLED", "true").lower() != "false"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"] if _rate_limit_enabled else [],
    enabled=_rate_limit_enabled,
)
