# Keynet

Keynet is a special TLD for securely serving HTTP over Tor, keeping clients anonymous but not requiring anonymity for the server.

Keynet services have URLs like this:

`http://[encoded-key].keynet/`

Where `[encoded-key]` is the Tor relay's Ed25519 identity key.

To access the service, the Tor client needs to identify the Tor relay with this key and specify it as the exit node of the circuit. Within that node, this domain will point back to itself (using `/etc/hosts`) so it can fulfill the request locally.

Keynet services do not use TLS because similar protection is provided via the Tor protocol — adding TLS would be redundant. This avoids any need for key signing because the keynet domain represents the Tor node's public key, so the ownership of that key is naturally secured by the cryptography and does not require attestation by certificate authorities.

## Manual Setup (No Docker)

Keynet is straightforward to set up manually. You only need:
1. A set of Ed25519 + RSA keys such that the RSA fingerprint and Ed25519 pubkey have the same first byte
  - (Code is provided for this)
2. A Tor relay configured with those keys, and some special config
3. A HTTP service to target

See [MANUAL_SETUP.md](MANUAL_SETUP.md) for full instructions.

## Quick Start

Keynet proxies any HTTP service through Tor. You control what gets served via the `PROXY_TARGET` environment variable.

### Demo Mode (Meta RPC Server)

Try the included Meta RPC Server demo:

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | PROXY_TARGET=demo bash
```

Or manually:

```bash
docker build --build-arg TOR_NICKNAME=MyRelayName -t keynet .
docker run -d -p 9001:9001 -p 9030:9030 \
  -e PROXY_TARGET=demo \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  keynet
```

### Proxy Your Own Service

To proxy any HTTP service through Keynet:

**For a local service on localhost:**

```bash
docker run -d -p 9001:9001 -p 9030:9030 \
  -e PROXY_TARGET=http://localhost:8000 \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  --network=host \
  keynet
```

**For a remote service:**

```bash
docker run -d -p 9001:9001 -p 9030:9030 \
  -e PROXY_TARGET=http://myservice.example.com:3000 \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  keynet
```

The installation script automatically detects localhost targets and adds `--network=host` for you.

**Important:** The `PROXY_TARGET` must be a full URL (`http://host:port`) that the container can reach. Use `--network=host` when proxying services on localhost.

## Installation

### Automated Install

This will prompt for your relay's nickname and proxy target:

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | bash
```

You can also specify these as environment variables to skip prompts:

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | \
  TOR_NICKNAME=MyRelayName PROXY_TARGET=http://localhost:8000 bash
```

Or use the demo mode:

```bash
curl -fsSL https://raw.githubusercontent.com/voltrevo/keynet/main/install.sh | \
  TOR_NICKNAME=MyRelayName PROXY_TARGET=demo bash
```

This script will:
- Install Docker if not already installed
- Clone the Keynet repository
- Build the Docker image with your chosen nickname
- Start the container with persistent key storage and your configured proxy target

**NOTE**: It takes a while (hours unfortunately) for new Tor nodes to become visible in the network, and your keynet service won't work until this happens. You can check visibility by searching your node's nickname or IP at https://onionoo.torproject.org/summary. Once it appears there, you can try [testing it](#verification).

### Manual Build and Run

```bash
# Build the image with a unique relay nickname (required)
docker build --build-arg TOR_NICKNAME=MyRelayName -t keynet .

# Run with a proxy target
docker run -d -p 9001:9001 -p 9030:9030 \
  -e PROXY_TARGET=http://localhost:8000 \
  -v ~/keynet-data/keys:/var/lib/tor/keys \
  --network=host \
  keynet
```

The volume mount persists the Tor relay identity across container restarts. If the keys directory is empty, new keys will be generated on first run.

On startup you'll see output similar to:

```text
[keynet] keynet address: http://abcdefghijklmnopqrstuvwx.keynet/
[keynet] ✓ Successfully connected to PROXY_TARGET
```

**NOTE**: It takes a while (hours unfortunately) for new Tor nodes to become visible in the network, and your keynet service won't work until this happens. You can check visibility by searching your node's nickname or IP at https://onionoo.torproject.org/summary. Once it appears there, you can try [testing it](#verification).

## Configuration

### PROXY_TARGET (Required)

Set this environment variable to specify what HTTP service to proxy:

```bash
# Proxy a local service on localhost (use --network=host)
-e PROXY_TARGET=http://localhost:8000

# Proxy a remote service
-e PROXY_TARGET=http://192.168.1.5:3000

# Demo mode: use the included Meta RPC Server
-e PROXY_TARGET=demo
```

**Note:** Keynet always exits to `127.0.0.1:80` locally via its reverse proxy, regardless of where the `PROXY_TARGET` is located.

**Container behavior:**
- Validates that `PROXY_TARGET` is configured (fails with helpful message if missing)
- Tests connectivity on startup (retries up to 5 times with 2-second intervals)
- Exits with a clear error message and troubleshooting tips if target is unreachable
- For demo mode, automatically starts the Meta RPC Server on port 3000

## Demo: Meta RPC Server

When `PROXY_TARGET=demo`, Keynet starts a built-in Meta RPC Server that provides random load-balanced JSON-RPC access to multiple blockchain networks.

### Supported Networks

- **Ethereum** (Chain ID: 1) — 5 public endpoints
- **Arbitrum** (Chain ID: 42161) — 5 public endpoints
- **Optimism** (Chain ID: 10) — 5 public endpoints
- **Base** (Chain ID: 8453) — 5 public endpoints
- **Polygon** (Chain ID: 137) — 5 public endpoints

### Usage

Route requests by network name, chain ID, or alias (via Tor):

```
POST http://[keynet-addr].keynet/ethereum
Content-Type: application/json

{"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}
```

Other routing options:

```
POST http://[keynet-addr].keynet/1              # By chain ID
POST http://[keynet-addr].keynet/eth            # By alias (eth, arb, op, poly, matic)
```

### API Endpoints

- `GET /` — HTML help page with full documentation
- `GET /info` — JSON metadata about supported networks and endpoints
- `GET /health` — Health check endpoint (returns `{"status": "ok", "uptime": "..."}`); useful for container health probes
- `POST /<network>` — JSON-RPC proxy to the selected network

Request bodies must be valid JSON-RPC 2.0 format. The server randomly selects from the available endpoints for each network to distribute load.

**Request size limit**: Maximum 1MB per request to prevent abuse.

## Architecture

### Key Generation

On first run, Keynet generates:
- **Ed25519 master key** — Used as the Keynet address (domain identifier)
- **RSA identity key** — Used in Tor consensus; fingerprint first byte matches Ed25519 first byte for efficient relay discovery

Keys are persisted in the mounted volume, so the same Keynet address is used across container restarts.

### RSA Fingerprint Matching

The setup automatically generates an RSA keypair whose SHA-1 fingerprint matches the first byte of the Ed25519 public key. This enables efficient discovery of the relay hosting the keynet service.

### Network Flow

```
Tor Client
  ↓
Tor Network (encrypted)
  ↓
Your Tor Relay (exit node)
  ↓
Caddy (reverse proxy on :80)
  ↓
PROXY_TARGET (your service)
```

The container runs:
- **Tor relay** (ports 9001, 9030) — Tor networking
- **dnsmasq** — DNS resolution for `.keynet` domain
- **Caddy** — HTTP reverse proxy
- **PROXY_TARGET service** (optional) — Your service or Meta RPC Server

## Verification

To verify your Keynet relay is working correctly, you need to make an HTTP request through Tor to your Keynet address. You can do this using:

**Option 1: Tor JS (Web-based)**

Visit https://voltrevo.github.io/tor-js/ and use the web interface to make requests to `http://[keynet-addr].keynet/`

**Option 2: curlTor CLI**

Install the tor-js npm package and use the curlTor CLI:

```bash
npm install -g tor-js
curlTor http://[keynet-addr].keynet/
```

Both tools will route your request through Tor, specify your relay as the exit node, and display the response from your Keynet service.
