#!/usr/bin/env node
/**
 * Test script to verify RSA fingerprint matching with Ed25519 public key
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';

function extractRsaPublicKeyDer(publicKeyPem: string): Buffer {
  const base64 = publicKeyPem
    .replace(/-----BEGIN RSA PUBLIC KEY-----/, '')
    .replace(/-----END RSA PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  return Buffer.from(base64, 'base64');
}

function calculateRsaFingerprint(publicKeyDer: Buffer): Buffer {
  return createHash('sha1').update(publicKeyDer).digest();
}

function readTorPublicKey(path: string): Uint8Array {
  const data = readFileSync(path);
  // Skip 32-byte header, read 32-byte public key
  return new Uint8Array(data.slice(32, 64));
}

const torKeysDir = process.argv[2] || '/var/lib/tor/keys';

const ed25519PublicKeyPath = `${torKeysDir}/ed25519_master_id_public_key`;
const rsaPublicKeyPath = `${torKeysDir}/secret_onion_key`;

if (!existsSync(ed25519PublicKeyPath)) {
  console.error(`Ed25519 public key not found at ${ed25519PublicKeyPath}`);
  process.exit(1);
}

if (!existsSync(rsaPublicKeyPath)) {
  console.error(`RSA public key not found at ${rsaPublicKeyPath}`);
  process.exit(1);
}

const ed25519PublicKey = readTorPublicKey(ed25519PublicKeyPath);
const rsaPublicKeyPem = readFileSync(rsaPublicKeyPath, 'utf-8');
const rsaPublicKeyDer = extractRsaPublicKeyDer(rsaPublicKeyPem);
const rsaFingerprint = calculateRsaFingerprint(rsaPublicKeyDer);

console.log('\n=== Fingerprint Matching Test ===\n');
console.log('Ed25519 Public Key (first 4 bytes):', Buffer.from(ed25519PublicKey.slice(0, 4)).toString('hex').toUpperCase());
console.log('RSA Fingerprint (first 4 bytes):    ', rsaFingerprint.slice(0, 4).toString('hex').toUpperCase());
console.log('\nEd25519 Public Key (full):', Buffer.from(ed25519PublicKey).toString('hex').toUpperCase());
console.log('RSA Fingerprint (full):    ', rsaFingerprint.toString('hex').toUpperCase());

const match = ed25519PublicKey[0] === rsaFingerprint[0];
console.log('\n✓ First byte matches:', match ? 'YES ✓' : 'NO ✗');

if (!match) {
  process.exit(1);
}
