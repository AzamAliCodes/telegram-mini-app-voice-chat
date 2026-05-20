import pytest
from ..core.security import verify_telegram_init_data

def test_verify_telegram_init_data_invalid():
    # Test with dummy data
    init_data = "user=%7B%22id%22%3A123%7D&hash=invalid"
    bot_token = "dummy_token"
    assert verify_telegram_init_data(init_data, bot_token) is False

def test_verify_telegram_init_data_format():
    # Test that it handles malformed data gracefully
    assert verify_telegram_init_data("malformed", "token") is False
