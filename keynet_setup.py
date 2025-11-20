#!/usr/bin/env python3
import sys
import base64
import hashlib

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization


def load_tor_ed25519_blob(path: str, header_prefix: str) -> bytes:
    """Load a Tor ed25519 key file (binary format)."""
    with open(path, "rb") as f:
        return f.read()


def extract_pubkey_from_public_blob(raw: bytes) -> bytes:
    """Public blob ends with the 32-byte Ed25519 public key."""
    if len(raw) < 32:
        raise ValueError("public key blob too short")
    return raw[-32:]


def extract_seed_and_pub_from_secret_blob(raw: bytes) -> (bytes, bytes):
    """Secret blob ends with 32-byte seed || 32-byte pubkey."""
    if len(raw) < 64:
        raise ValueError("secret key blob too short")
    tail = raw[-64:]
    seed = tail[:32]
    pub = tail[32:]
    return seed, pub


def make_keynet_label(pubkey: bytes) -> str:
    """Onion v3-style encoding of the pubkey into a label."""
    if len(pubkey) != 32:
        raise ValueError("expected 32-byte Ed25519 pubkey")

    version = b"\x03"
    checksum_input = b".onion checksum" + pubkey + version
    checksum = hashlib.sha3_256(checksum_input).digest()[:2]
    addr_bytes = pubkey + checksum + version
    label = base64.b32encode(addr_bytes).decode("ascii").lower()
    return label


def write_pem_from_seed(seed: bytes, pem_path: str) -> None:
    """Construct PKCS#8 Ed25519 private key from a 32-byte seed and write as PEM."""
    if len(seed) != 32:
        raise ValueError("expected 32-byte Ed25519 seed")

    sk = ed25519.Ed25519PrivateKey.from_private_bytes(seed)
    pem = sk.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(pem_path, "wb") as f:
        f.write(pem)


def main():
    if len(sys.argv) != 4:
        print(
            "usage: keynet_setup.py "
            "<ed25519_master_id_public_key> "
            "<ed25519_master_id_secret_key> "
            "<output_pem_key>",
            file=sys.stderr,
        )
        sys.exit(1)

    pub_path = sys.argv[1]
    sec_path = sys.argv[2]
    pem_out = sys.argv[3]

    pub_raw = load_tor_ed25519_blob(pub_path, "== ed25519v1-public")
    sec_raw = load_tor_ed25519_blob(sec_path, "== ed25519v1-secret")

    pub = extract_pubkey_from_public_blob(pub_raw)
    seed, pub2 = extract_seed_and_pub_from_secret_blob(sec_raw)

    # Optional sanity check
    if pub != pub2:
        print(
            "[keynet] WARNING: public key from secret blob does not match public key file",
            file=sys.stderr,
        )

    label = make_keynet_label(pub)

    # Write PEM private key for Caddy
    write_pem_from_seed(seed, pem_out)

    # Print the keynet label
    print(label)


if __name__ == "__main__":
    main()
