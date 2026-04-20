/**
 * Step definitions for encryption/decryption demo scenarios.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { encryptText, decryptText } from '../utils/encryptionHelper.js';
import { log } from '../utils/logger.js';

type DemoWorld = {
  plainText?: string;
  encryptedPayload?: string;
  decryptedPayload?: string;
  decryptError?: unknown;
};

/**
 * Store plaintext payload for encryption tests.
 *
 * @example
 * Given a plaintext payload "hello encryption demo"
 */
Given('a plaintext payload {string}', function (this: DemoWorld, payload: string) {
  this.plainText = payload;
});

/**
 * Store an invalid encrypted payload to test decrypt failure.
 *
 * @example
 * Given an invalid encrypted payload "not-a-valid-payload"
 */
Given('an invalid encrypted payload {string}', function (this: DemoWorld, payload: string) {
  this.encryptedPayload = payload;
});

/**
 * Encrypt the plaintext using a base64 key.
 * Calls encryptText() from encryptionHelper.
 *
 * @example
 * When I encrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
 */
When('I encrypt the payload using base64 key {string}', function (this: DemoWorld, key: string) {
  if (!this.plainText) throw new Error('Plaintext payload not set');
  this.encryptedPayload = encryptText(this.plainText, { key, keyEncoding: 'base64' });
});

/**
 * Decrypt the encrypted payload using a base64 key.
 * Calls decryptText() from encryptionHelper.
 *
 * @example
 * And I decrypt the payload using base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
 */
When('I decrypt the payload using base64 key {string}', function (this: DemoWorld, key: string) {
  if (!this.encryptedPayload) throw new Error('Encrypted payload not set');
  this.decryptedPayload = decryptText(this.encryptedPayload, { key, keyEncoding: 'base64' });
});

/**
 * Log the encrypted payload to the report output.
 *
 * @example
 * And I print the encrypted payload
 */
When('I print the encrypted payload', async function (this: DemoWorld) {
  if (!this.encryptedPayload) {
    const message = 'Encrypted payload not set';
    log(message, 'WARN');
    if (typeof (this as any).attach === 'function') {
      await (this as any).attach(message, 'text/plain');
    }
    return;
  }
  const message = `Encrypted payload: ${this.encryptedPayload}`;
  log(message, 'INFO');
  if (typeof (this as any).attach === 'function') {
    await (this as any).attach(message, 'text/plain');
  }
});

/**
 * Attempt to decrypt and capture any error.
 * Calls decryptText() and stores the error for negative scenarios.
 *
 * @example
 * When I try to decrypt with base64 key "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
 */
When('I try to decrypt with base64 key {string}', function (this: DemoWorld, key: string) {
  if (!this.encryptedPayload) throw new Error('Encrypted payload not set');
  try {
    this.decryptedPayload = decryptText(this.encryptedPayload, { key, keyEncoding: 'base64' });
    this.decryptError = null;
  } catch (error) {
    this.decryptError = error;
  }
});

/**
 * Assert decrypted payload matches original plaintext.
 *
 * @example
 * Then decrypted payload should equal original
 */
Then('decrypted payload should equal original', function (this: DemoWorld) {
  expect(this.decryptedPayload).to.equal(this.plainText);
});

/**
 * Assert encrypted payload differs from the original plaintext.
 *
 * @example
 * And encrypted payload should not equal original
 */
Then('encrypted payload should not equal original', function (this: DemoWorld) {
  expect(this.encryptedPayload).to.not.equal(this.plainText);
});

/**
 * Assert decryption fails for invalid payloads.
 *
 * @example
 * Then decryption should fail
 */
Then('decryption should fail', function (this: DemoWorld) {
  expect(this.decryptError).to.be.instanceOf(Error);
});
