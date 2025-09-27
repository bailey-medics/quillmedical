import os

# Set minimal required environment variables for testing
os.environ.setdefault(
    "JWT_SECRET", "test_secret_key_long_enough_for_validation_32_chars_min"
)
os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
