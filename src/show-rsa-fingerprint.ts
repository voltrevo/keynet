#!/usr/bin/env node
/**
 * Display RSA identity fingerprint for the running Tor node
 */

import { readFileSync, existsSync } from 'fs';
import { createHash, createPublicKey } from 'crypto';

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

console.log(`\n=== Tor Relay Identity ===\n`);
console.log(`Keys directory: ${torKeysDir}\n`);

// Read Ed25519 public key
const ed25519PublicKeyPath = `${torKeysDir}/ed25519_master_id_public_key`;
if (existsSync(ed25519PublicKeyPath)) {
  const ed25519PublicKey = readTorPublicKey(ed25519PublicKeyPath);
  console.log('Ed25519 Public Key:');
  console.log('  Full:', Buffer.from(ed25519PublicKey).toString('hex').toUpperCase());
  console.log('  First byte:', Buffer.from(ed25519PublicKey.slice(0, 1)).toString('hex').toUpperCase());
  console.log();
} else {
  console.log('Ed25519 public key not found\n');
}

// Read RSA identity key (used in consensus)
const rsaSecretKeyPath = `${torKeysDir}/secret_id_key`;
if (!existsSync(rsaSecretKeyPath)) {
  console.error(`ERROR: RSA identity key not found at ${rsaSecretKeyPath}`);
  process.exit(1);
}

// Extract public key from private key to get the proper format
const rsaSecretKeyPem = readFileSync(rsaSecretKeyPath, 'utf-8');
// For identity fingerprint, we need to extract the public key portion
// The consensus uses the ASN.1 DER encoding of the RSA public key
const publicKey = createPublicKey({
  key: rsaSecretKeyPem,
  format: 'pem',
  type: 'pkcs1'
});
const rsaPublicKeyPem = publicKey.export({ type: 'pkcs1', format: 'pem' }) as string;
const rsaPublicKeyDer = extractRsaPublicKeyDer(rsaPublicKeyPem);
const rsaFingerprint = calculateRsaFingerprint(rsaPublicKeyDer);

console.log('RSA Identity Fingerprint:');
console.log('  Hex:', rsaFingerprint.toString('hex').toUpperCase());
console.log('  Base64:', rsaFingerprint.toString('base64'));
console.log('  First byte:', rsaFingerprint.slice(0, 1).toString('hex').toUpperCase());
console.log('  Formatted:', rsaFingerprint.toString('hex').toUpperCase().match(/.{1,4}/g)?.join(' '));
console.log();

// Check if they match
if (existsSync(ed25519PublicKeyPath)) {
  const ed25519PublicKey = readTorPublicKey(ed25519PublicKeyPath);
  const match = ed25519PublicKey[0] === rsaFingerprint[0];
  console.log(`First byte match: ${match ? 'YES' : 'NO'}`);
  if (match) {
    console.log('  Ed25519[0]:', Buffer.from([ed25519PublicKey[0]]).toString('hex').toUpperCase());
    console.log('  RSA FP[0]:', Buffer.from([rsaFingerprint[0]]).toString('hex').toUpperCase());
  }
  console.log();
}
