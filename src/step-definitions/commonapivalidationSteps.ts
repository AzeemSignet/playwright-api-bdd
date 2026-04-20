/**
 * Step definitions for Stibo API request/response validation flows.
 */
import { Given, When, Then, setDefaultTimeout, DataTable, BeforeAll, AfterAll, Before, setWorldConstructor, World } from '@cucumber/cucumber';
import { promises as fs } from 'fs';
import path from 'path';
import {
  setAuthContext,
  setBaseUrl,
  sendXMLRequest,
  sendJSONRequest,
  readFixtureFile,
  convertRequestBodyToJson,
  logResponse,
  validateStatusRange,
  getResponse,
  setResponse,
  sendRequest,
  postReqWithHeaders,
  sendReq
} from '../utils/httpHelper.js';
import { initializeLogger, logError, flushLogs, log } from '../utils/logger.js';

setDefaultTimeout(40000);

// Path for persistent variable storage across test runs
const STORED_VARIABLES_FILE = path.join(process.cwd(), 'test-reports', 'stored-variables.json');

// Load stored variables from file
async function loadStoredVariables(): Promise<Record<string, any>> {
  try {
    const content = await fs.readFile(STORED_VARIABLES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    // File doesn't exist yet, return empty object
    return {};
  }
}

// Save stored variables to file
async function saveStoredVariables(variables: Record<string, any>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORED_VARIABLES_FILE), { recursive: true });
    await fs.writeFile(STORED_VARIABLES_FILE, JSON.stringify(variables, null, 2), 'utf-8');
  } catch (err) {
    logError('Failed to save stored variables', err);
  }
}

// Initialize logger before tests
BeforeAll(async function () {
  await initializeLogger();
});

// Before each scenario, load stored variables from file
Before(async function () {
  const savedVars = await loadStoredVariables();
  (this as any).storedVariables = savedVars;
  log(`✓ Loaded ${Object.keys(savedVars).length} stored variables`, 'INFO');
});

// Flush remaining logs after tests
AfterAll(async function () {
  await flushLogs();
});

function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_, key) => process.env[key] ?? _);
}

function getHeadersFromDataTable(maybeTable?: unknown): Record<string, string> {
  if (!maybeTable) return {};

  const table = maybeTable as DataTable;
  if (typeof table.rowsHash === 'function') {
    const raw = table.rowsHash() as Record<string, string>;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, resolveEnvPlaceholders(v)]));
  }

  if (typeof table.hashes === 'function') {
    const hashes = table.hashes() as Array<Record<string, string>>;
    return hashes.reduce((acc, row) => Object.assign(acc, row), {} as Record<string, string>);
  }

  if (typeof table.raw === 'function') {
    const rows = table.raw() as string[][];
    return rows.reduce((acc, row) => {
      const key = row[0];
      const value = row[1];
      if (key !== undefined && value !== undefined) acc[key] = resolveEnvPlaceholders(value);
      return acc;
    }, {} as Record<string, string>);
  }

  return {};
}

// Step definitions
/**
 * Configure request context and optional headers.
 * Calls setAuthContext() from stiboApiHelper to persist the header map.
 *
 * @example
 * Given API authentication header is "" present
 *   | Content-Type       | application/xml |
 *   | Native-Business-Id | 9999            |
 *   | interface-key      | mdm-producer    |
 */
Given(/^API authentication header is "(.*)" present$/, function (
  flag: string,
  dataTableOrCallback?: DataTable | ((error?: unknown) => void)
) {
  if (typeof dataTableOrCallback === 'function') {
    setAuthContext(flag, {})
      .then(() => dataTableOrCallback())
      .catch((error) => dataTableOrCallback(error));
    return;
  }

  const headers = getHeadersFromDataTable(dataTableOrCallback);
  return setAuthContext(flag, headers);
});

/**
 * Override the base URL for the current scenario.
 *
 * @example
 * Given base URL is "https://httpbin.org"
 */
Given('base URL is {string}', async function (baseUrl: string) {
  await setBaseUrl(baseUrl);
});


/**
 * Send a request without a body.
 * Calls sendRequest() from stiboApiHelper to issue the HTTP call.
 *
 * @example
 * When I send a "GET" request to "/stibo/mdm/v1"
 */
When('I send a {string} request to {string}', async function (method: string, endpoint: string) {
  (this as any).setTimeout?.(40000);
  await sendRequest(method, endpoint);
});

/**
 * Print a fixture body converted to JSON for inspection.
 *
 * @example
 * When I print request body converted to json from "fixtures/producer-request-body.xml"
 */
When('I print request body converted to json from {string}', async function (fixturePath: string) {
  (this as any).setTimeout?.(40000);
  const bodyText = await readFixtureFile(fixturePath);
  const jsonBody = await convertRequestBodyToJson(bodyText);
  const formattedBody = JSON.stringify(jsonBody, null, 2);

  const details = `
========== REQUEST BODY (CONVERTED TO JSON) ==========
Source: ${fixturePath}

${formattedBody}
=====================================================
`;

  await (this as any).attach(details, 'text/plain');
  log(details, 'INFO');
});

/**
 * Validate response status range (e.g., 2xx/4xx).
 * Calls logResponse() then validateStatusRange() for assertions.
 *
 * @example
 * Then response status should be "2xx"
 */
Then('response status should be {string}', async function (range: string) {
  // Check if there was an error from validation
  let response = (this as any).lastError || getResponse();
  if (!response) throw new Error('No response available');
  const status = response.status();
  const headers = response.headers ? response.headers() : {};
  let bodyText = '';
  
  try {
    bodyText = await response.text();
  } catch (err) {
    bodyText = `<unable to read body: ${String(err)}>`;
  }

  logResponse(status, headers, bodyText);
  validateStatusRange(status, range, headers, bodyText);
});

/**
 * Print response details and attach to report output.
 *
 * @example
 * Then I print the response
 */
Then('I print the response', async function () {
  // Check if there was an error from validation
  const response = (this as any).lastError || getResponse();
  if (!response) throw new Error('No response available');
  const status = response.status();
  const headers = response.headers ? response.headers() : {};
  let bodyText = '';
  
  try {
    bodyText = await response.text();
  } catch (err) {
    bodyText = `<unable to read body: ${String(err)}>`;
  }

  // Try to parse body as JSON to check for field-level error details
  let parsedBody: any;
  let formattedBody = bodyText;
  try {
    parsedBody = JSON.parse(bodyText);
    
    // If there are field-level error details, format them nicely
    if (parsedBody.details && Array.isArray(parsedBody.details)) {
      formattedBody = JSON.stringify(parsedBody, null, 2);
    } else {
      formattedBody = JSON.stringify(parsedBody, null, 2);
    }
  } catch {
    // Body is not JSON, keep as is
  }

  // Create formatted response details with enhanced field error information
  let responseDetails = `
========== RESPONSE DETAILS ==========
Status Code: ${status}

Headers:
${JSON.stringify(headers, null, 2)}

Body:
${formattedBody}`;

  // If validation failed with field details, add a summary section
  if (parsedBody && parsedBody.details && Array.isArray(parsedBody.details) && parsedBody.details.length > 0) {
    responseDetails += `

Field Validation Errors:
${parsedBody.details.map((detail: any, index: number) => {
  return `  ${index + 1}. Field: ${detail.field}
     Message: ${detail.message}
     Rule: ${detail.rule}
     Value: ${JSON.stringify(detail.value)}`;
}).join('\n')}`;
  }

  responseDetails += `
=====================================
`;


  // Attach to HTML report
  await (this as any).attach(responseDetails, 'text/plain');
  
  // Print response details using logger for visibility
  log('');
  log('========== RESPONSE DETAILS ==========', 'INFO');
  log(`Status Code: ${status}`, 'INFO');
  log(`Headers: ${JSON.stringify(headers, null, 2)}`, 'INFO');
  log(`Body:\n${formattedBody}`, 'INFO');
  
  // Log field-level errors if present
  if (parsedBody && parsedBody.details && Array.isArray(parsedBody.details) && parsedBody.details.length > 0) {
    log('\nField Validation Errors:', 'ERROR');
    parsedBody.details.forEach((detail: any, index: number) => {
      log(`  ${index + 1}. Field: ${detail.field}`, 'ERROR');
      log(`     Message: ${detail.message}`, 'ERROR');
      log(`     Rule: ${detail.rule}`, 'ERROR');
      log(`     Value: ${JSON.stringify(detail.value)}`, 'ERROR');
    });
  }
  
  log('=====================================', 'INFO');
  log('');
  await flushLogs();
  
  // Also print to console for immediate visibility
  // eslint-disable-next-line no-console
  console.log('\n========== RESPONSE DETAILS ==========');
  // eslint-disable-next-line no-console
  console.log(`Status Code: ${status}`);
  // eslint-disable-next-line no-console
  console.log(`Headers: ${JSON.stringify(headers, null, 2)}`);
  // eslint-disable-next-line no-console
  console.log(`Body:\n${formattedBody}`);
  
  // Print field-level errors to console as well
  if (parsedBody && parsedBody.details && Array.isArray(parsedBody.details) && parsedBody.details.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nField Validation Errors:');
    parsedBody.details.forEach((detail: any, index: number) => {
      // eslint-disable-next-line no-console
      console.log(`  ${index + 1}. Field: ${detail.field}`);
      // eslint-disable-next-line no-console
      console.log(`     Message: ${detail.message}`);
      // eslint-disable-next-line no-console
      console.log(`     Rule: ${detail.rule}`);
      // eslint-disable-next-line no-console
      console.log(`     Value: ${JSON.stringify(detail.value)}`);
    });
  }
  
  // eslint-disable-next-line no-console
  console.log('=====================================\n');
});

//DOM CONSUMER CODE//

When('I send a {string} request to {string} with request body from {string}', async function (method: string, endpoint: string, fixturePath: string) {
  (this as any).setTimeout?.(40000);
  const bodyText = await readFixtureFile(fixturePath);
  const payload = bodyText.trim();

await sendReq(method, endpoint,payload);

});

Then('response should contain key {string} with value {string}', async function (keyPath: string, expectedValue: string) {
  const response = getResponse();
  if (!response) throw new Error('No response available');
  const body = JSON.parse(await response.text());

  // Normalize bracket notation to dot notation: resources[0].name -> resources.0.name
  const normalizedPath = keyPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalizedPath.split('.');

  const actualValue = segments.reduce((obj: any, segment: string) => {
    if (obj === undefined || obj === null) return undefined;
    return obj[segment];
  }, body);

  if (actualValue === undefined) {
    throw new Error(`Key "${keyPath}" not found in response: ${JSON.stringify(body, null, 2)}`);
  }
  if (String(actualValue) !== expectedValue) {
    throw new Error(`Expected "${keyPath}" to be "${expectedValue}" but got "${String(actualValue)}"`);
  }
});

/**
 * Check whether a key exists in the response body and print its value if found.
 * Supports dot notation and array index notation for nested keys.
 *
 * Example:
 *   Then the response should have key "data.id"
 *   Then the response should have key "items[0].name"
 */
Then('response should have key {string}', async function (keyPath: string) {
  const response = getResponse();
  if (!response) throw new Error('No response available');

  const body = JSON.parse(await response.text());
  const value = keyPath.split('.').reduce((obj: any, key) => obj?.[key], body);

  if (value === undefined) throw new Error(`Key "${keyPath}" not found in response`);

  console.log(`[Key Check] "${keyPath}" = ${JSON.stringify(value)}`);
  await (this as any).attach(`"${keyPath}" = ${JSON.stringify(value)}`, 'text/plain');
});
