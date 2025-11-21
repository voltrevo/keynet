#!/usr/bin/env node
/**
 * Quick unit tests for RSA fingerprint calculation (no brute force)
 */

import { calculateRsaFingerprint, extractRsaPublicKeyDer } from './keynet-setup.js';
import { generateKeyPairSync } from 'crypto';

function testRsaFingerprintCalculation() {
  console.log('\n=== Testing RSA Fingerprint Calculation ===\n');
  
  // Generate a single RSA key for testing
  console.log('Generating test RSA keypair...');
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: {
      type: 'pkcs1',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem'
    }
  });
  
  console.log('✓ RSA keypair generated');
  
  // Extract DER
  const publicKeyDer = extractRsaPublicKeyDer(publicKey);
  console.log(`✓ DER extracted (${publicKeyDer.length} bytes)`);
  
  // Calculate fingerprint
  const fingerprint = calculateRsaFingerprint(publicKeyDer);
  console.log(`✓ Fingerprint calculated: ${fingerprint.toString('hex').toUpperCase()}`);
  
  // Verify fingerprint is 20 bytes (SHA-1)
  if (fingerprint.length !== 20) {
    console.error(`ERROR: Expected fingerprint to be 20 bytes, got ${fingerprint.length}`);
    process.exit(1);
  }
  console.log('✓ Fingerprint is 20 bytes (SHA-1)');
  
  // Verify deterministic calculation
  const fingerprint2 = calculateRsaFingerprint(publicKeyDer);
  if (!fingerprint.equals(fingerprint2)) {
    console.error('ERROR: Fingerprint calculation is not deterministic!');
    process.exit(1);
  }
  console.log('✓ Fingerprint calculation is deterministic');
  
  console.log('\n✅ All tests passed!');
}

function testExtractRsaPublicKeyDer() {
  console.log('\n=== Testing RSA Public Key DER Extraction ===\n');
  
  // Generate a test key
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: {
      type: 'pkcs1',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem'
    }
  });
  
  console.log('Generated test RSA public key');
  
  // Verify PEM format
  if (!publicKey.includes('-----BEGIN RSA PUBLIC KEY-----')) {
    console.error('ERROR: Public key missing BEGIN header');
    process.exit(1);
  }
  if (!publicKey.includes('-----END RSA PUBLIC KEY-----')) {
    console.error('ERROR: Public key missing END header');
    process.exit(1);
  }
  console.log('✓ Public key has valid PEM headers');
  
  // Extract DER
  const der = extractRsaPublicKeyDer(publicKey);
  console.log(`✓ Extracted DER (${der.length} bytes)`);
  
  // Verify DER is not empty
  if (der.length === 0) {
    console.error('ERROR: DER is empty');
    process.exit(1);
  }
  console.log('✓ DER is not empty');
  
  // Verify extraction is deterministic
  const der2 = extractRsaPublicKeyDer(publicKey);
  if (!der.equals(der2)) {
    console.error('ERROR: DER extraction is not deterministic');
    process.exit(1);
  }
  console.log('✓ DER extraction is deterministic');
  
  console.log('\n✅ All tests passed!');
}

// Run tests
try {
  testExtractRsaPublicKeyDer();
  testRsaFingerprintCalculation();
  
  console.log('\n🎉 All quick tests completed successfully!\n');
  console.log('Note: For full integration testing including brute-force matching,');
  console.log('run: npx tsx src/keynet-setup.test.ts\n');
} catch (error) {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
}
