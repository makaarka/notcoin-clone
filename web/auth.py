import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

import config


class InvalidInitData(Exception):
    pass


def validate_init_data(init_data: str, max_age_seconds: int = 86400) -> dict:
    """Validate Telegram WebApp initData and return the parsed user dict.

    Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not init_data:
        raise InvalidInitData("empty init_data")

    pairs = dict(parse_qsl(init_data, strict_parsing=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InvalidInitData("missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))

    secret_key = hmac.new(b"WebAppData", config.BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise InvalidInitData("hash mismatch")

    auth_date = int(pairs.get("auth_date", "0"))
    if max_age_seconds and time.time() - auth_date > max_age_seconds:
        raise InvalidInitData("init_data expired")

    user_raw = pairs.get("user")
    if not user_raw:
        raise InvalidInitData("missing user")

    return json.loads(user_raw)
