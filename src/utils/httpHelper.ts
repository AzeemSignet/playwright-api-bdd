/**
 * Stibo API helper: request sending, auth headers, validation, and response helpers.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { expect } from 'chai';
import { ApiClient } from './apiClient.js';
import { ENV } from '../config/env.js';
import { sendRequest as sendRequestUtil } from './requestHelper.js';
import { request } from '@playwright/test';
import { logRequest, logResponse as logResponseUtil, log, logError } from './logger.js';
import { validateAndConvert, getValidationSummary, exportValidationErrors, convertToJson, type ValidationResult } from './validator.js';
import { getValidationSchema } from './validationSchema.js';
import { getOAuthAuthorizationHeader } from './oauthTokenHelper.js';
import { encryptText, decryptText } from './encryptionHelper.js';
import { ENDPOINTS } from '../config/endpoints.js';
import { FIXTURES } from '../config/fixtures.js';

let response: any;
let context: any;
let authHeaders = true;
let customHeaders: Record<string, string> = {};
// Request-preprocessing caches to reduce repeated CPU/disk work while still
// issuing a real HTTP request each time. These caches are keyed by content,
// so any change to the request body or fixture file results in a cache miss.
// This keeps behavior safe for scenarios with different inputs, while allowing
// identical bodies to skip conversion/validation and fixture re-reads.
const fixtureCache = new Map<string, string>();
const validationCache = new Map<string, ValidationResult>();
const conversionCache = new Map<string, any>();

function isEndpointProvided(endpoint: string): boolean {
  return typeof endpoint === 'string' && endpoint.trim().length > 0;
}

function isEndpointRequired(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname || '';
    return path === '' || path === '/';
  } catch {
    return true;
  }
}

function resolveEndpoint(endpoint: string): string {
  if (!endpoint) return endpoint;
  const key = endpoint.trim();
  return ENDPOINTS[key] || endpoint;
}

function buildFullUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const resolvedEndpoint = resolveEndpoint(endpoint);
  return isEndpointProvided(resolvedEndpoint) ? base + resolvedEndpoint : base;
}

function resolveFixturePath(fixturePath: string): string {
  if (!fixturePath) return fixturePath;
  const key = fixturePath.trim();
  return FIXTURES[key] || fixturePath;
}

// Cache key is schema type + full input string. Different bodies or different
// schema types will not collide, so a new body is always reprocessed once and
// then cached for later identical reuse.
function getValidationCacheKey(schemaType: string, input: string): string {
  return `${schemaType}:${input}`;
}

async function getValidationResultWithCache(
  input: string,
  schemaType: 'stibo' | 'generic',
  schema: any,
  logValidation: boolean
): Promise<ValidationResult> {
  // Validation cache is content-addressed. If the request body changes, this
  // becomes a cache miss, and we validate/convert once, then reuse for later
  // identical bodies. This intentionally never caches HTTP responses.
  const cacheKey = getValidationCacheKey(schemaType, input);
  const cached = validationCache.get(cacheKey);
  if (cached) {
    if (logValidation) {
      log('Using cached validation result', 'INFO');
      if (cached.isValid) {
        log('✓ Validation PASSED - cached result', 'INFO');
      } else {
        log(`✗ Validation FAILED - ${cached.errors.length} error(s) cached`, 'ERROR');
      }
    }
    return cached;
  }

  const result = await validateAndConvert(input, schema, logValidation);
  validationCache.set(cacheKey, result);
  return result;
}

async function setInvalidEndpointResponse(method: string, endpoint: string, headers: Record<string, string>, bodyText?: string): Promise<void> {
  const fullUrl = buildFullUrl(ENV.baseUrl, endpoint);
  await logRequest(method, fullUrl, headers, bodyText);

  const respText = JSON.stringify({
    error: 'Invalid endpoint',
    message: 'Endpoint is required for this base URL and cannot be empty.'
  });
  await logResponseUtil(400, { 'content-type': 'application/json' }, respText);

  response = {
    status: () => 400,
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => respText
  } as any;
}

function normalizeHeaders(input?: Record<string, string>): Record<string, string> {
  if (!input) return {};
  const normalized: Record<string, string> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      normalized[key] = String(value);
    }
  });
  return normalized;
}

function normalizeHeaderKeys(input?: Record<string, string>): Record<string, string> {
  if (!input) return {};
  const normalized: Record<string, string> = {};
  Object.entries(input).forEach(([key, value]) => {
    normalized[key.toLowerCase()] = String(value);
  });
  return normalized;
}

function isMockBaseUrl(baseUrl: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.startsWith('mock:') || normalized.startsWith('demo:');
}

async function setMockResponse(
  method: string,
  endpoint: string,
  headers: Record<string, string>,
  bodyText?: string | null
): Promise<void> {
  const fullUrl = buildFullUrl(ENV.baseUrl, endpoint);
  await logRequest(method, fullUrl, headers, bodyText ?? undefined);

  const payload = {
    mock: true,
    method,
    url: fullUrl,
    endpoint,
    headers: normalizeHeaderKeys(headers),
    body: bodyText ?? null
  };

  const respText = JSON.stringify(payload);
  const respHeaders = {
    'content-type': 'application/json',
    'x-mock-response': 'true'
  };

  await logResponseUtil(200, respHeaders, respText);

  response = {
    status: () => 200,
    headers: () => respHeaders,
    text: async () => respText
  } as any;
}

function validateMandatoryHeaderValues(headers: Record<string, string>): void {
  if ('Native-Business-Id' in headers && !headers['Native-Business-Id']) {
    throw new Error('Native-Business-Id value is required when the header is provided');
  }
  if ('interface-key' in headers && !headers['interface-key']) {
    throw new Error('interface-key value is required when the header is provided');
  }
}

function isTruthy(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
}

function shouldEncryptBody(): boolean {
  return isTruthy(ENV.encryptionEnabled) || isTruthy(customHeaders['X-Encrypt-Body']);
}

function shouldDecryptResponse(): boolean {
  return isTruthy(customHeaders['X-Decrypt-Response']);
}

async function resolveAuthorizationHeader(): Promise<string | undefined> {
  if (customHeaders['Authorization']) return customHeaders['Authorization'];
  if (authHeaders && ENV.token) return `Bearer ${ENV.token}`;
  if (authHeaders) {
    const oauthHeader = await getOAuthAuthorizationHeader();
    if (oauthHeader) return oauthHeader;
  }
  return undefined;
}

export async function setAuthContext(flag: string, headers?: Record<string, string>): Promise<void> {
  customHeaders = normalizeHeaders(headers);
  if (flag === 'not' || flag === 'no') {
    context = await request.newContext({ baseURL: ENV.baseUrl });
    authHeaders = false;
  } else {
    context = await ApiClient.getContext();
    authHeaders = true;
  }
}

export async function setBaseUrl(baseUrl: string): Promise<void> {
  const nextBaseUrl = String(baseUrl || '').trim();
  if (!nextBaseUrl) return;
  ENV.baseUrl = nextBaseUrl;
  process.env.BASE_URL = nextBaseUrl;

  if (context) {
    if (authHeaders) {
      context = await ApiClient.getContext();
    } else {
      context = await request.newContext({ baseURL: ENV.baseUrl });
    }
  }
}

export async function sendXMLRequest(method: string, endpoint: string, bodyText: string): Promise<void> {
  // Check payload size (256KB = 262144 bytes)
  const PAYLOAD_SIZE_LIMIT = 256 * 1024; // 256 KB
  const payloadSize = Buffer.byteLength(bodyText, 'utf-8');
  const isOversized = payloadSize > PAYLOAD_SIZE_LIMIT;
  
  // Reject oversized payloads - enforce 256KB size limit
  if (isOversized) {
    const sizeInKB = (payloadSize / 1024).toFixed(2);
    log(`Payload size: ${sizeInKB} KB (exceeds 256KB limit)`, 'ERROR');
    throw new Error(`Request body exceeds maximum allowed size of 256KB. Current size: ${sizeInKB} KB`);
  }
  
  // Validate XML request body before sending
  log('Validating XML request body...', 'INFO');
  
  // For STIBO XML, use a simplified validation approach
  // Only validate the critical fields that must be present
  const schema = getValidationSchema('stibo');
  const validationResult = await getValidationResultWithCache(bodyText, 'stibo', schema, true);
  const convertedBody = validationResult.convertedData;
  
  // Log validation summary
  const summary = getValidationSummary(validationResult);
  log(summary, 'INFO');
  
  // If validation fails, save errors to file and throw error (STRICT MODE)
  if (!validationResult.isValid) {
    const errorReport = exportValidationErrors(validationResult.errors);
    const errorFilePath = path.join(process.cwd(), 'test-reports', `validation-errors-${Date.now()}.json`);
    
    try {
      await fs.writeFile(errorFilePath, errorReport, 'utf-8');
      log(`Validation errors saved to: ${errorFilePath}`, 'ERROR');
    } catch (err) {
      logError('Failed to save validation errors', err);
    }
    
    // STRICT MODE: Block the request if validation fails
    // Create detailed error message with field information
    const fieldErrors = validationResult.errors.map(err => ({
      field: err.field,
      message: err.message,
      value: err.value,
      rule: err.rule
    }));
    
    const errorMessage = {
      error: 'Request Validation Failed',
      message: `Request validation failed with ${validationResult.errors.length} error(s). Check logs for details.`,
      code: 413,
      details: fieldErrors
    };
    
    throw new Error(JSON.stringify(errorMessage));
  }
  
  log('✓ Validation passed - Sending request', 'INFO');
  if (convertedBody) {
    log(`Converted request preview: ${JSON.stringify(convertedBody).substring(0, 200)}...`, 'INFO');
  }
  
  const fetchHeaders: Record<string, string> = { ...customHeaders };
  if (authHeaders) {
    validateMandatoryHeaderValues(fetchHeaders);
  }
  
  if (!fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/xml';
  }
  
  if (authHeaders) {
    if (customHeaders['Native-Business-Id']) {
      fetchHeaders['Native-Business-Id'] = customHeaders['Native-Business-Id'];
    }
    if (customHeaders['interface-key']) {
      fetchHeaders['interface-key'] = customHeaders['interface-key'];
    }
  }
  
  // Handle Authorization header (Bearer, Basic, OAuth, or other token types)
  const authorization = await resolveAuthorizationHeader();
  if (authorization) {
    fetchHeaders['Authorization'] = authorization;
  }

  const encryptBody = shouldEncryptBody();
  const outboundBody = encryptBody ? encryptText(bodyText) : bodyText;
  if (encryptBody) {
    fetchHeaders['X-Encrypted-Body'] = 'true';
  }

  if (isMockBaseUrl(ENV.baseUrl)) {
    await setMockResponse(method, endpoint, fetchHeaders, outboundBody);
    return;
  }

  if (!isEndpointProvided(endpoint) && isEndpointRequired(ENV.baseUrl)) {
    await setInvalidEndpointResponse(method, endpoint, fetchHeaders, outboundBody);
    return;
  }

  const fullUrl = buildFullUrl(ENV.baseUrl, endpoint);

  await logRequest(method, fullUrl, fetchHeaders, outboundBody);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout

  try {
    const fetchResp = await fetch(fullUrl, {
      method,
      headers: fetchHeaders,
      body: outboundBody,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const respText = await fetchResp.text();
    await logResponseUtil(fetchResp.status, Object.fromEntries(fetchResp.headers ? Array.from(fetchResp.headers.entries()) : []), respText);

    const shouldDecrypt = shouldDecryptResponse();
    response = {
      status: () => fetchResp.status,
      headers: () => Object.fromEntries(fetchResp.headers ? Array.from(fetchResp.headers.entries()) : []),
      text: async () => (shouldDecrypt ? decryptText(respText) : respText)
    } as any;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after 50 seconds for ${method} ${fullUrl}`);
    }
    throw error;
  }
}

export async function sendJSONRequest(method: string, endpoint: string, bodyText: string): Promise<void> {
  // Validate JSON request body before sending
  log('Validating JSON request body...', 'INFO');
  const schema = getValidationSchema('generic');
  const validationResult = await getValidationResultWithCache(bodyText, 'generic', schema, true);
  
  // Log validation summary
  const summary = getValidationSummary(validationResult);
  log(summary, 'INFO');
  
  // If validation fails, save errors to file and throw
  if (!validationResult.isValid) {
    const errorReport = exportValidationErrors(validationResult.errors);
    const errorFilePath = path.join(process.cwd(), 'test-reports', `validation-errors-${Date.now()}.json`);
    
    try {
      await fs.writeFile(errorFilePath, errorReport, 'utf-8');
      log(`Validation errors saved to: ${errorFilePath}`, 'ERROR');
    } catch (err) {
      logError('Failed to save validation errors', err);
    }
    
    // Create detailed error message with field information
    const fieldErrors = validationResult.errors.map(err => ({
      field: err.field,
      message: err.message,
      value: err.value,
      rule: err.rule
    }));
    
    const errorMessage = {
      error: 'Request Validation Failed',
      message: `Request validation failed with ${validationResult.errors.length} error(s). Check logs for details.`,
      code: 413,
      details: fieldErrors
    };
    
    throw new Error(JSON.stringify(errorMessage));
  }
  
  log('✓ Validation passed - Sending request', 'INFO');
  
  const requestBody = validationResult.convertedData ?? JSON.parse(bodyText);
  let options: { headers?: Record<string, string> } | undefined;
  
  if (authHeaders) {
    validateMandatoryHeaderValues(customHeaders);
  }

  if (authHeaders) {
    const headers: Record<string, string> = {};
    if (customHeaders['Native-Business-Id']) {
      headers['Native-Business-Id'] = customHeaders['Native-Business-Id'];
    }
    if (customHeaders['interface-key']) {
      headers['interface-key'] = customHeaders['interface-key'];
    }
    // Handle Authorization header (Bearer, Basic, OAuth, or other token types)
    const authorization = await resolveAuthorizationHeader();
    if (authorization) {
      headers['Authorization'] = authorization;
    }
    if (Object.keys(headers).length > 0) {
      options = { headers };
    }
  }
  
  const encryptBody = shouldEncryptBody();
  const outboundBody = encryptBody ? encryptText(JSON.stringify(requestBody)) : requestBody;
  if (encryptBody) {
    const headers = options?.headers || {};
    headers['X-Encrypted-Body'] = 'true';
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'text/plain';
    }
    options = { headers };
  }

  if (isMockBaseUrl(ENV.baseUrl)) {
    const headers = options?.headers || {};
    const mockBody = encryptBody ? String(outboundBody) : JSON.stringify(requestBody);
    await setMockResponse(method, endpoint, headers, mockBody);
    return;
  }

  if (!isEndpointProvided(endpoint) && isEndpointRequired(ENV.baseUrl)) {
    await setInvalidEndpointResponse(method, endpoint, options?.headers || {}, encryptBody ? String(outboundBody) : bodyText);
    return;
  }

  response = await sendRequestUtil(context, method, endpoint, outboundBody, options);
  if (shouldDecryptResponse()) {
    const originalText = response.text.bind(response);
    response.text = async () => decryptText(await originalText());
  }
}

export async function sendRequest(method: string, endpoint: string): Promise<void> {
  const fetchHeaders: Record<string, string> = { ...customHeaders };
  if (authHeaders) {
    validateMandatoryHeaderValues(fetchHeaders);
  }
  
  if (authHeaders) {
    if (customHeaders['Native-Business-Id']) {
      fetchHeaders['Native-Business-Id'] = customHeaders['Native-Business-Id'];
    }
    if (customHeaders['interface-key']) {
      fetchHeaders['interface-key'] = customHeaders['interface-key'];
    }
  }
  
  // Handle Authorization header (Bearer, Basic, OAuth, or other token types)
  const authorization = await resolveAuthorizationHeader();
  if (authorization) {
    fetchHeaders['Authorization'] = authorization;
  }

  if (isMockBaseUrl(ENV.baseUrl)) {
    await setMockResponse(method, endpoint, fetchHeaders, null);
    return;
  }

  if (!isEndpointProvided(endpoint) && isEndpointRequired(ENV.baseUrl)) {
    await setInvalidEndpointResponse(method, endpoint, fetchHeaders);
    return;
  }

  const fullUrl = buildFullUrl(ENV.baseUrl, endpoint);
  await logRequest(method, fullUrl, fetchHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout

  try {
    const fetchResp = await fetch(fullUrl, {
      method,
      headers: fetchHeaders,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const respText = await fetchResp.text();
    await logResponseUtil(fetchResp.status, Object.fromEntries(fetchResp.headers ? Array.from(fetchResp.headers.entries()) : []), respText);

    const shouldDecrypt = shouldDecryptResponse();
    response = {
      status: () => fetchResp.status,
      headers: () => Object.fromEntries(fetchResp.headers ? Array.from(fetchResp.headers.entries()) : []),
      text: async () => (shouldDecrypt ? decryptText(respText) : respText)
    } as any;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after 50 seconds for ${method} ${fullUrl}`);
    }
    throw error;
  }
}

export async function readFixtureFile(fixturePath: string): Promise<string> {
  const resolved = resolveFixturePath(fixturePath);
  const fullPath = path.join(process.cwd(), 'src', 'features', resolved);
  // Cache by absolute fixture path. If the file content is updated on disk
  // during the run, clearRequestCaches() (or restarting the run) will refresh.
  const cached = fixtureCache.get(fullPath);
  const raw = cached ?? await fs.readFile(fullPath, 'utf8');
  if (!cached) fixtureCache.set(fullPath, raw);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return raw
    .replace(/\{\{NOW\}\}/g, new Date().toISOString())
    .replace(/\{\{TOMORROW\}\}/g, tomorrow);
}

export async function convertRequestBodyToJson(bodyText: string): Promise<any> {
  // Cache by full body text to avoid repeated XML->JSON conversion when the
  // exact same body is used across multiple scenarios or steps.
  const cached = conversionCache.get(bodyText);
  if (cached) return cached;
  const converted = await convertToJson(bodyText);
  conversionCache.set(bodyText, converted);
  return converted;
}

export function clearRequestCaches(): void {
  // Clears all preprocessing caches. This can be triggered per feature file
  // (via the step hook) to avoid cross-feature contamination while retaining
  // fast reuse within the same feature.
  fixtureCache.clear();
  validationCache.clear();
  conversionCache.clear();
}

export function logResponse(status: number, headers: Record<string, string>, bodyText: string): void {
  const truncated = bodyText.length > 2000 ? bodyText.slice(0, 2000) + '...[truncated]' : bodyText;
  
  // eslint-disable-next-line no-console
  console.log('Response status:', status);
  // eslint-disable-next-line no-console
  console.log('Response headers:', JSON.stringify(headers));
  // eslint-disable-next-line no-console
  console.log('Response body:', truncated);
}

export function validateStatusRange(status: number, range: string, headers: Record<string, string>, bodyText: string): void {
  const truncated = bodyText.length > 2000 ? bodyText.slice(0, 2000) + '...[truncated]' : bodyText;

  if (range === '2xx') {
    if (status < 200 || status > 299) {
      throw new Error(`Expected 2xx but got ${status}\nHeaders: ${JSON.stringify(headers)}\nBody: ${truncated}`);
    }
    expect(status).to.be.within(200, 299);
  } else if (range === '4xx') {
    if (status < 400 || status > 499) {
      throw new Error(`Expected 4xx but got ${status}\nHeaders: ${JSON.stringify(headers)}\nBody: ${truncated}`);
    }
    expect(status).to.be.within(400, 499);
  } else {
    throw new Error(`Unsupported status range requested: ${range}`);
  }
}

export function getResponse(): any {
  return response;
}

export function setResponse(newResponse: any): void {
  response = newResponse;
}

//DOM CODE//

export async function baseUrl(){  
      context = await request.newContext({ baseURL: ENV.baseUrl });
    }
  
export async function postReqWithHeaders(headers:any,payload:any){  
      await context.POST('digital/employee/v1',{
        headers:headers,
        data:payload});
        return response;

      };
  
export async function sendReq(method: string, endpoint: string, payload: string): Promise<void> {
  const fetchHeaders: Record<string, string> = { ...customHeaders };
  
  // Use configurable base URL
  const fullUrl = buildFullUrl(ENV.baseUrl, endpoint);

  // Set Content-Type header for JSON requests
  if (!fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  await logRequest(method, fullUrl, fetchHeaders, payload);

  // Parse payload if it's a JSON string
  let requestBody: any = payload;
  try {
    requestBody = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (error) {
    log(`Warning: Could not parse payload as JSON, sending as-is`, 'WARN');
  }

  response = await sendRequestUtil(context, method, fullUrl, requestBody, { headers: fetchHeaders });
  
  // Call response methods with proper function syntax
  const statusCode = response.status();
  //const headers = response.headers();
  
  log(`← Response Status: ${statusCode}`, 'INFO');
  
  try {
    const responseBody = await response.json();
    log(`← Response Body: ${JSON.stringify(responseBody, null, 2)}`, 'INFO');
  } catch (error) {
    const responseText = await response.text();
    log(`← Response Text: ${responseText}`, 'INFO');
  }
}
    
  