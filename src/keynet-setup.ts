#!/usr/bin/env node
/**
 * Generate or load Ed25519 keys for Keynet/Tor, write in Tor format,
 * derive keynet address, and export PEM key for TLS.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha3_256 } from '@noble/hashes/sha3';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface KeynetSetupResult {
  keynetAddress: string;
  ed25519Fingerprint: string;
  publicKeyHex: string;
}

/**
 * Generate a new Ed25519 keypair
 */
function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Write Tor ed25519_master_id_public_key format:
 * 32 bytes: "== ed25519v1-public: type0 =="
 * 32 bytes: Ed25519 public key
 */
function writeTorPublicKey(path: string, publicKey: Uint8Array): void {
  const header = Buffer.from('== ed25519v1-public: type0 ==\x00\x00\x00');
  const keyData = Buffer.concat([header, Buffer.from(publicKey)]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, keyData);
}

/**
 * Write Tor ed25519_master_id_secret_key format:
 * 32 bytes: "== ed25519v1-secret: type0 =="
 * 32 bytes: Ed25519 secret key (seed)
 * 32 bytes: Ed25519 public key
 */
function writeTorSecretKey(
  path: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): void {
  const header = Buffer.from('== ed25519v1-secret: type0 ==\x00\x00\x00');
  const keyData = Buffer.concat([
    header,
    Buffer.from(privateKey),
    Buffer.from(publicKey),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, keyData, { mode: 0o600 });
}

/**
 * Read Tor secret key and extract private key
 */
function readTorSecretKey(path: string): Uint8Array {
  const data = readFileSync(path);
  // Skip 32-byte header, read 32-byte private key
  return new Uint8Array(data.slice(32, 64));
}

/**
 * Read Tor public key
 */
function readTorPublicKey(path: string): Uint8Array {
  const data = readFileSync(path);
  // Skip 32-byte header, read 32-byte public key
  return new Uint8Array(data.slice(32, 64));
}

/**
 * Derive keynet address using Onion v3 encoding
 */
function deriveKeynetAddress(publicKey: Uint8Array): string {
  const version = new Uint8Array([0x03]);
  const checksumInput = Buffer.concat([
    Buffer.from('.onion checksum'),
    Buffer.from(publicKey),
    Buffer.from(version),
  ]);
  const checksum = sha3_256(checksumInput).slice(0, 2);
  const addressBytes = Buffer.concat([
    Buffer.from(publicKey),
    Buffer.from(checksum),
    Buffer.from(version),
  ]);
  return Buffer.from(addressBytes).toString('base64')
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .toLowerCase()
    .slice(0, 56);
}

/**
 * More correct base32 encoding for onion v3 addresses
 */
function deriveKeynetAddressBase32(publicKey: Uint8Array): string {
  const version = new Uint8Array([0x03]);
  const checksumInput = Buffer.concat([
    Buffer.from('.onion checksum'),
    Buffer.from(publicKey),
    Buffer.from(version),
  ]);
  const checksum = sha3_256(checksumInput).slice(0, 2);
  const addressBytes = Buffer.concat([
    Buffer.from(publicKey),
    Buffer.from(checksum),
    Buffer.from(version),
  ]);
  
  // Base32 encode (RFC 4648)
  const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (const byte of addressBytes) {
    value = (value << 8) | byte;
    bits += 8;
    
    while (bits >= 5) {
      result += base32Chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += base32Chars[(value << (5 - bits)) & 31];
  }
  
  return result;
}

/**
 * Write PEM private key for TLS
 */
function writePemPrivateKey(path: string, privateKey: Uint8Array): void {
  // PKCS#8 format for Ed25519
  const pkcs8Header = Buffer.from([
    0x30, 0x2e, // SEQUENCE, 46 bytes
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x05, // SEQUENCE, 5 bytes (algorithm)
    0x06, 0x03, 0x2b, 0x65, 0x70, // OID 1.3.101.112 (Ed25519)
    0x04, 0x22, // OCTET STRING, 34 bytes
    0x04, 0x20, // OCTET STRING, 32 bytes (private key)
  ]);
  
  const derData = Buffer.concat([pkcs8Header, Buffer.from(privateKey)]);
  const base64 = derData.toString('base64').match(/.{1,64}/g)?.join('\n') || '';
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;
  
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { mode: 0o600 });
}

/**
 * Main setup function
 */
function setupKeynet(
  torKeysDir: string,
  pemKeyPath: string,
  forceRegenerate = false
): KeynetSetupResult {
  const publicKeyPath = `${torKeysDir}/ed25519_master_id_public_key`;
  const secretKeyPath = `${torKeysDir}/ed25519_master_id_secret_key`;
  
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  
  // Check if keys already exist
  if (!forceRegenerate && existsSync(secretKeyPath) && existsSync(publicKeyPath)) {
    console.error('[keynet] Loading existing Ed25519 keys...');
    privateKey = readTorSecretKey(secretKeyPath);
    publicKey = readTorPublicKey(publicKeyPath);
  } else {
    console.error('[keynet] Generating new Ed25519 keypair...');
    const keyPair = generateKeyPair();
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    
    // Write Tor format keys
    writeTorPublicKey(publicKeyPath, publicKey);
    writeTorSecretKey(secretKeyPath, privateKey, publicKey);
  }
  
  // Derive keynet address
  const keynetAddress = deriveKeynetAddressBase32(publicKey);
  
  // Write PEM key for TLS
  writePemPrivateKey(pemKeyPath, privateKey);
  
  // Generate fingerprint (base64)
  const ed25519Fingerprint = Buffer.from(publicKey).toString('base64').replace(/=/g, '');
  
  return {
    keynetAddress,
    ed25519Fingerprint,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: keynet-setup <tor-keys-dir> <pem-key-path> [--force]');
    process.exit(1);
  }
  
  const [torKeysDir, pemKeyPath] = args;
  const forceRegenerate = args.includes('--force');
  
  try {
    const result = setupKeynet(torKeysDir, pemKeyPath, forceRegenerate);
    
    // Output just the keynet address for shell scripts
    console.log(result.keynetAddress);
    
    // Output additional info to stderr
    console.error(`[keynet] Keynet address: https://${result.keynetAddress}.keynet/`);
    console.error(`[keynet] Ed25519 fingerprint: ${result.ed25519Fingerprint}`);
    console.error(`[keynet] Public key: ${result.publicKeyHex}`);
  } catch (error) {
    console.error('[keynet] ERROR:', error);
    process.exit(1);
  }
}

export { setupKeynet, generateKeyPair, deriveKeynetAddressBase32 };
