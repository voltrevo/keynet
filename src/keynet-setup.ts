#!/usr/bin/env node
/**
 * Generate or load Ed25519 keys for Keynet/Tor, write in Tor format,
 * derive keynet address, and export PEM key for TLS.
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { createHash, generateKeyPairSync, createPublicKey } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  generateKeyPair,
  writeTorPublicKey,
  writeTorSecretKey,
  readTorSecretKey,
  readTorPublicKey
} from './util.js';

interface KeynetSetupResult {
  keynetAddress: string;
  ed25519Fingerprint: string;
  publicKeyHex: string;
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
 * Calculate RSA fingerprint (SHA-1 of the public key in DER format)
 */
function calculateRsaFingerprint(publicKeyDer: Buffer): Buffer {
  return createHash('sha1').update(publicKeyDer).digest();
}

/**
 * Extract DER-encoded RSA public key from PEM
 */
function extractRsaPublicKeyDer(publicKeyPem: string): Buffer {
  const base64 = publicKeyPem
    .replace(/-----BEGIN RSA PUBLIC KEY-----/, '')
    .replace(/-----END RSA PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  return Buffer.from(base64, 'base64');
}

/**
 * Generate RSA keypair with fingerprint matching first byte of target
 */
function generateMatchingRsaKey(targetBytes: Uint8Array): { privateKey: string; publicKey: string; fingerprint: Buffer; attempts: number } {
  const targetPrefix = Buffer.from(targetBytes.slice(0, 1));
  console.error(`[keynet] Searching for RSA key with fingerprint starting with: ${targetPrefix.toString('hex')}`);
  
  let attempts = 0;
  const maxAttempts = 10000; // Safety limit (should find match quickly with 1 byte)
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Generate RSA keypair
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 1024, // Tor uses 1024-bit RSA keys
      publicKeyEncoding: {
        type: 'pkcs1',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs1',
        format: 'pem'
      }
    });
    
    // Calculate fingerprint
    const publicKeyDer = extractRsaPublicKeyDer(publicKey);
    const fingerprint = calculateRsaFingerprint(publicKeyDer);
    
    // Check if first byte matches
    if (fingerprint[0] === targetPrefix[0]) {
      console.error(`[keynet] Found matching RSA key after ${attempts} attempts`);
      console.error(`[keynet] RSA fingerprint: ${fingerprint.toString('hex').toUpperCase()}`);
      return { privateKey, publicKey, fingerprint, attempts };
    }
    
    if (attempts % 100 === 0) {
      console.error(`[keynet] Searched ${attempts} RSA keys so far...`);
    }
  }
  
  throw new Error(`Failed to find matching RSA key after ${maxAttempts} attempts`);
}

/**
 * Write Tor RSA secret key
 */
function writeTorRsaSecretKey(path: string, privateKeyPem: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
}

/**
 * Read Tor RSA secret key
 */
function readTorRsaSecretKey(path: string): string {
  return readFileSync(path, 'utf-8');
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
  const rsaSecretKeyPath = `${torKeysDir}/secret_id_key`;
  
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
    
    // Write Tor format keys (both secret and public)
    writeTorPublicKey(publicKeyPath, publicKey);
    writeTorSecretKey(secretKeyPath, privateKey, publicKey);
  }
  
  // Generate or load RSA keys with matching fingerprint
  if (!forceRegenerate && existsSync(rsaSecretKeyPath)) {
    console.error('[keynet] Loading existing RSA identity key...');
    const rsaPrivateKeyPem = readTorRsaSecretKey(rsaSecretKeyPath);
    // Derive public key from private key to calculate fingerprint
    const rsaPublicKey = createPublicKey({
      key: rsaPrivateKeyPem,
      format: 'pem',
      type: 'pkcs1'
    });
    const rsaPublicKeyPem = rsaPublicKey.export({ type: 'pkcs1', format: 'pem' }) as string;
    const publicKeyDer = extractRsaPublicKeyDer(rsaPublicKeyPem);
    const fingerprint = calculateRsaFingerprint(publicKeyDer);
    console.error(`[keynet] RSA fingerprint: ${fingerprint.toString('hex').toUpperCase()}`);
  } else {
    console.error('[keynet] Generating RSA keypair with matching fingerprint...');
    const rsaKeyPair = generateMatchingRsaKey(publicKey);
    writeTorRsaSecretKey(rsaSecretKeyPath, rsaKeyPair.privateKey);
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

export { setupKeynet, generateKeyPair, deriveKeynetAddressBase32, generateMatchingRsaKey, calculateRsaFingerprint, extractRsaPublicKeyDer };
