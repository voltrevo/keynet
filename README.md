# Keynet

Keynet is a special TLD for securely serving http over Tor, keeping clients anonymous but not
requiring anonymity for the server.

Keynet services have URLs like this:

`http://[encoded-key].keynet/`

Where `[encoded-key]` is the Tor relay's Ed25519 identity key.

To access the service, the Tor client needs identify the Tor relay with this key and specify
it as the exit node of the circuit. Within that node, this domain will point back to itself
(using `/etc/hosts`) so it can fulfil the request locally.

Keynet services do not use TLS because similar protection is provided via the Tor protocol - adding
TLS would be redundant. This avoids any need for key signing because the keynet domain represents
the Tor node's public key, so the ownership of that key is naturally secured by the cryptography
and does not require attestation by certificate authorities.

## Quick Install

The easiest way to install Keynet on a remote server (will prompt for nickname):

```bash
ssh myserver 'curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | bash'
```

Or specify the nickname directly in the command:

```bash
ssh myserver 'TOR_NICKNAME=MyRelayName curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | bash'
```

This script will:
- Install Docker if not already installed
- Clone the Keynet repository
- Build the Docker image with your chosen nickname
- Start the container with persistent key storage

## Building and Running Manually

From this directory:

```bash
# Build the image with a unique relay nickname (required)
docker build --build-arg TOR_NICKNAME=MyRelayName -t keynet .

# Run the container
docker run -d -p 9001:9001 -p 9030:9030 \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  keynet
```

The volume mount persists the Tor relay identity across container restarts. If the keys directory is empty, new keys will be generated on first run.

On startup you'll see output similar to:

```text
[keynet] keynet address: http://abcdefghijklmnopqrstuvwx.keynet/
```

Inside the container, that hostname resolves via `/etc/hosts` to the container's IP, and Caddy serves your Ed25519-backed HTTP endpoint at that URL.

## RSA Fingerprint Matching

The setup automatically generates an RSA keypair whose SHA-1 fingerprint matches the first byte of the Ed25519 public key. This enables efficient discovery of the relay hosting the keynet service.
