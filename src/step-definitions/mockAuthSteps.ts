/**
 * Step definitions for validating mock auth header echoes.
 * Uses getResponse() to read the API response and getEchoedHeader() to locate header values.
 */
import { Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { getResponse } from '../utils/httpHelper.js';

function isMockResponse(headers: Record<string, string>): boolean {
  const marker = headers['x-mock-response'] || headers['X-Mock-Response'] || '';
  return String(marker).toLowerCase() === 'true';
}

/**
 * Validate the echoed header value from the mock response payload.
 * Reads the response via getResponse(), parses JSON, then checks getEchoedHeader().
 *
 * @example
 * And mock response should include header "Authorization" with value "Bearer demo-access-token"
 */
Then('mock response should include header {string} with value {string}', async function (headerName: string, expectedValue: string) {
  const response = getResponse();
  if (!response) throw new Error('No response available');

  const headers = response.headers ? response.headers() : {};
  const bodyText = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    if (isMockResponse(headers)) {
      throw new Error('Mock response body is not JSON');
    }
    throw new Error('Response body is not JSON');
  }

  const actual = getEchoedHeader(payload, headerName);
  const contextLabel = isMockResponse(headers) ? 'mock request' : 'response';
  expect(actual, `Expected ${contextLabel} header "${headerName}" to be present`).to.exist;
  expect(actual).to.equal(expectedValue);
});

function getEchoedHeader(payload: any, headerName: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const headers = payload.headers || payload.Headers || {};
  const headerKey = headerName.toLowerCase();

  if (headers[headerKey]) return headers[headerKey];
  const matchKey = Object.keys(headers).find((key) => key.toLowerCase() === headerKey);
  return matchKey ? headers[matchKey] : undefined;
}

