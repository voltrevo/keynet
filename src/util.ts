/**
 * Utility functions for Keynet/Tor key operations
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Generate a new Ed25519 keypair using Tor's method.
 * 
 * Generates a random seed, hashes it with SHA-512, and uses the
 * first 32 bytes (after clamping) as the expanded secret key.
 * The public key is derived by reducing this value mod L and
 * multiplying the base point.
 */
export function generateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  // Generate a random 32-byte seed
  const seed = ed25519.utils.randomPrivateKey();
  
  // Hash the seed with SHA-512 to get 64 bytes
  const hash = sha512(seed);
  
  // Take the first 32 bytes and clamp them (RFC 8032 clamping)
  const expandedSecret = new Uint8Array(hash.slice(0, 32));
  expandedSecret[0] &= 248;  // Clear lowest 3 bits
  expandedSecret[31] &= 127; // Clear highest bit
  expandedSecret[31] |= 64;  // Set second highest bit
  
  // Derive the public key using Tor's method
  const publicKey = derivePublicKeyFromTorSecret(expandedSecret);
  
  return { privateKey: expandedSecret, publicKey };
}

/**
 * Write Tor ed25519_master_id_public_key format:
 * 32 bytes: "== ed25519v1-public: type0 =="
 * 32 bytes: Ed25519 public key
 */
export function writeTorPublicKey(path: string, publicKey: Uint8Array): void {
  const header = Buffer.from('== ed25519v1-public: type0 ==\x00\x00\x00');
  const keyData = Buffer.concat([header, Buffer.from(publicKey)]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, keyData, { mode: 0o600 });
}

/**
 * Write Tor ed25519_master_id_secret_key format:
 * 32 bytes: "== ed25519v1-secret: type0 =="
 * 64 bytes: Ed25519 expanded secret key (expanded scalar + hash prefix)
 * 
 * The format stores the result of hashing a seed:
 * - First 32 bytes: clamped scalar (used for deriving public key)
 * - Second 32 bytes: hash prefix (used in signing, not used here)
 * 
 * Note: privateKey should be the already-expanded 32-byte scalar from generateKeyPair.
 * We regenerate the original seed's full hash to get the second 32 bytes.
 */
export function writeTorSecretKey(
  path: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): void {
  const header = Buffer.from('== ed25519v1-secret: type0 ==\x00\x00\x00');
  
  // privateKey is already the clamped expanded secret (first 32 bytes)
  // For the second 32 bytes, we need the hash prefix.
  // Since we don't have the original seed, we'll use the hash of the expanded secret itself.
  // This matches what we'd get if we hashed the seed and took bytes 32-64.
  const fullHash = sha512(privateKey);
  const hashPrefix = new Uint8Array(fullHash.slice(32, 64));
  
  // Write: header + expanded secret + hash prefix (96 bytes total)
  const keyData = Buffer.concat([
    header,
    Buffer.from(privateKey),   // 32-byte expanded secret (clamped scalar)
    Buffer.from(hashPrefix)     // 32-byte hash prefix
  ]);
  
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, keyData, { mode: 0o600 });
}

/**
 * Read Tor secret key and extract private key
 */
export function readTorSecretKey(path: string): Uint8Array {
  const data = readFileSync(path);
  
  // Validate file size (32-byte header + 32-byte seed + 32-byte scalar = 96 bytes)
  if (data.length !== 96) {
    throw new Error(`Invalid secret key file size: ${data.length} (expected 96)`);
  }
  
  // Validate 32-byte header
  const expectedHeader = Buffer.from('== ed25519v1-secret: type0 ==\x00\x00\x00');
  const actualHeader = data.slice(0, 32);
  
  if (!expectedHeader.equals(actualHeader)) {
    throw new Error('Invalid secret key header');
  }
  
  // Read 32-byte private key (seed)
  return new Uint8Array(data.slice(32, 64));
}

/**
 * Read Tor public key
 */
export function readTorPublicKey(path: string): Uint8Array {
  const data = readFileSync(path);
  
  // Validate file size (32-byte header + 32-byte public key = 64 bytes)
  if (data.length !== 64) {
    throw new Error(`Invalid public key file size: ${data.length} (expected 64)`);
  }
  
  // Validate 32-byte header
  const expectedHeader = Buffer.from('== ed25519v1-public: type0 ==\x00\x00\x00');
  const actualHeader = data.slice(0, 32);
  
  if (!expectedHeader.equals(actualHeader)) {
    throw new Error('Invalid public key header');
  }
  
  // Read 32-byte public key
  return new Uint8Array(data.slice(32, 64));
}

/**
 * Derive public key from Tor's expanded secret key format.
 * 
 * Tor stores the first 32 bytes as a "scalar" that needs to be:
 * 1. Interpreted as a little-endian integer
 * 2. Reduced modulo the curve order L
 * 3. Used to multiply the base point
 * 
 * @param expandedSecret - The first 32 bytes from Tor's secret key
 * @returns The derived public key
 */
export function derivePublicKeyFromTorSecret(expandedSecret: Uint8Array): Uint8Array {
  // Convert the 32 bytes to a bigint (little-endian)
  let scalarBigInt = 0n;
  for (let i = 0; i < 32; i++) {
    scalarBigInt |= BigInt(expandedSecret[i]) << (8n * BigInt(i));
  }
  
  // Reduce modulo the curve order
  const reducedScalar = scalarBigInt % ed25519.CURVE.n;
  
  // Multiply base point by the reduced scalar
  const Point = ed25519.ExtendedPoint;
  const publicPoint = Point.BASE.multiply(reducedScalar);
  
  return publicPoint.toRawBytes();
}

/**
 * Check if a Tor Ed25519 key pair is valid.
 * 
 * Validates that the public key can be derived from the expanded secret key
 * using Tor's key derivation method (reducing the stored bytes modulo L).
 * 
 * @param privateKey - 32-byte expanded secret (first 32 bytes from Tor's secret key file)
 * @param publicKey - 32-byte Ed25519 public key
 * @returns true if the key pair is valid, false otherwise
 */
export function checkTorKeyPair(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): boolean {
  // Validate input sizes
  if (privateKey.length !== 32) {
    console.error(`[checkTorKeyPair] Invalid private key length: ${privateKey.length} (expected 32)`);
    return false;
  }
  
  if (publicKey.length !== 32) {
    console.error(`[checkTorKeyPair] Invalid public key length: ${publicKey.length} (expected 32)`);
    return false;
  }
  
  try {
    // Derive the public key from the Tor expanded secret
    const derivedPublicKey = derivePublicKeyFromTorSecret(privateKey);
    
    // Compare with the provided public key
    if (derivedPublicKey.length !== publicKey.length) {
      console.error('[checkTorKeyPair] Derived public key length mismatch');
      return false;
    }
    
    for (let i = 0; i < derivedPublicKey.length; i++) {
      if (derivedPublicKey[i] !== publicKey[i]) {
        console.error('[checkTorKeyPair] Public key does not match private key');
        console.error(`[checkTorKeyPair] Expected: ${Buffer.from(derivedPublicKey).toString('hex')}`);
        console.error(`[checkTorKeyPair] Got:      ${Buffer.from(publicKey).toString('hex')}`);
        return false;
      }
    }
    
    // If we got here, the key pair is valid
    console.error('[checkTorKeyPair] Key pair is valid ✓');
    return true;
  } catch (error) {
    console.error('[checkTorKeyPair] Error validating key pair:', error);
    return false;
  }
}
