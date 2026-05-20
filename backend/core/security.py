import hmac
import hashlib
from urllib.parse import parse_qsl

def verify_telegram_init_data(init_data: str, bot_token: str) -> bool:
    """
    Verifies the data received from the Telegram Mini App.
    """
    try:
        parsed_data = dict(parse_qsl(init_data))
        hash_received = parsed_data.pop('hash', '')
        
        # Data check string
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        
        # Secret key
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        
        # HMAC-SHA256 signature
        hash_computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        return hash_computed == hash_received
    except Exception:
        return False
