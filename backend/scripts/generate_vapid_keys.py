# Generate VAPID (P-256) keys in URL-safe Base64 (no padding).
# Save this as generate_vapid_keys.py and run with your Poetry env:
#   poetry run python generate_vapid_keys.py

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def b64url(data: bytes) -> str:
    """URL-safe Base64 without '=' padding."""
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


# 1) Generate EC key pair (P-256 / SECP256R1)
private_key = ec.generate_private_key(ec.SECP256R1())
public_key = private_key.public_key()

# 2) Public key in uncompressed X9.62 format: 65 bytes (0x04 || X(32) || Y(32))
pub_uncompressed = public_key.public_bytes(
    encoding=Encoding.X962, format=PublicFormat.UncompressedPoint
)
assert len(pub_uncompressed) == 65 and pub_uncompressed[0] == 0x04

# 3) Private key raw 32-byte big-endian integer
priv_int = private_key.private_numbers().private_value
priv_bytes = priv_int.to_bytes(32, "big")

# 4) VAPID strings (URL-safe Base64, no padding)
VAPID_PUBLIC = b64url(pub_uncompressed)
VAPID_PRIVATE = b64url(priv_bytes)

print("\n=== VAPID KEYS ===")
print("Public (frontend & backend):")
print(VAPID_PUBLIC)
print("\nPrivate (backend ONLY – keep secret):")
print(VAPID_PRIVATE)
print("\nSave to envs like:\n")
print("  # frontend/.env")
print(f"  VITE_VAPID_PUBLIC={VAPID_PUBLIC}")
print("\n  # backend .env / secrets")
print(f"  VAPID_PUBLIC={VAPID_PUBLIC}")
print(f"  VAPID_PRIVATE={VAPID_PRIVATE}\n")
