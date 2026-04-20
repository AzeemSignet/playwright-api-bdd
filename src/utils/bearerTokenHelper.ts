/**
 * Helpers for extracting Bearer tokens from sessionStorage and using them in API calls.
 */
import type { APIRequestContext, Page } from '@playwright/test';
import { request } from '@playwright/test';
import { ENV } from '../config/env.js';
import { log } from './logger.js';

type SessionStorageMap = Record<string, string>;

type DeleteWorkspaceOptions = {
  page: Page;
  projectName: string;
  projectMapping: Record<string, string>;
  endpointTemplate: string; // e.g. "/api/v1/projects/mtoitems/{projectId}/cab"
  baseUrl?: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
  requestContext?: APIRequestContext;
};

function normalizeBearerToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  const unquoted = trimmed.replace(/^"|"$/g, '');
  return unquoted.replace(/^Bearer\s+/i, '');
}

function buildUrlFromTemplate(template: string, baseUrl: string, replacements: Record<string, string>): string {
  let url = template;
  for (const [key, value] of Object.entries(replacements)) {
    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    url = url.replace(new RegExp(`:${key}\\b`, 'g'), value);
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const base = baseUrl.replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

function decodeJwtPayload(jwt: string): Record<string, any> | null {
  try {
    const payload = jwt.split('.')[1];
    const decoded = Buffer.from(payload, 'base64').toString();
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function readSessionStorage(frame: { evaluate: Function; url: () => string }): Promise<SessionStorageMap> {
  return (await frame.evaluate(() => {
    const result: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      const value = sessionStorage.getItem(key);
      if (value !== null) result[key] = value;
    }
    return result;
  })) as SessionStorageMap;
}

function extractTokenFromStorage(storage: SessionStorageMap): string | null {
  for (const key of Object.keys(storage)) {
    const rawValue = storage[key];
    try {
      const obj = JSON.parse(rawValue);
      if (obj?.authnResult?.access_token) return obj.authnResult.access_token;
      if (obj?.value?.authnResult?.access_token) return obj.value.authnResult.access_token;
    } catch {
      // ignore non-JSON keys
    }
  }
  return null;
}

export async function getBearerTokenFromSessionStorage(page: Page, timeoutMs = 60000): Promise<string | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await page.waitForLoadState('networkidle');

    let token: string | null = null;

    for (const frame of page.frames()) {
      try {
        const sessionStorageData = await readSessionStorage(frame);
        log(`📦 Frame URL: ${frame.url()}`, 'INFO');
        log(`SessionStorage keys: ${Object.keys(sessionStorageData).join(', ') || '<none>'}`, 'INFO');

        token = extractTokenFromStorage(sessionStorageData);
        if (token) break;
      } catch (error) {
        log(`⚠️ Could not read sessionStorage for frame ${frame.url()}: ${String(error)}`, 'WARN');
      }
    }

    if (token) return token;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await page.waitForTimeout(20000);
  return null;
}

export async function deleteWorkspaceData(options: DeleteWorkspaceOptions): Promise<void> {
  const {
    page,
    projectName,
    projectMapping,
    endpointTemplate,
    baseUrl = ENV.baseUrl,
    timeoutMs = 60000,
    extraHeaders,
    requestContext
  } = options;

  log(`Deleting workspace data for project "${projectName}" using API`, 'INFO');

  const rawToken = await getBearerTokenFromSessionStorage(page, timeoutMs);
  if (!rawToken) {
    throw new Error('Bearer token not found in sessionStorage after waiting for async load');
  }

  const token = normalizeBearerToken(rawToken);
  log(`✅ Token extracted: ${token.slice(0, 10)}...`, 'INFO');

  const projectId = projectMapping[projectName];
  if (!projectId) {
    throw new Error(`Project ID not found for project name: "${projectName}"`);
  }

  const url = buildUrlFromTemplate(endpointTemplate, baseUrl, { projectId });
  log(`DELETE URL: ${url}`, 'INFO');

  const context = requestContext ?? (await request.newContext({ ignoreHTTPSErrors: true }));
  const disposeAfter = !requestContext;

  try {
    const response = await context.delete(url, {
      ignoreHTTPSErrors: true,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
        ...(extraHeaders || {})
      }
    });

    log(`API Response: ${response.status()} ${response.statusText()}`, 'INFO');

    if (response.status() === 401) {
      const body = await response.text();
      const decoded = decodeJwtPayload(token);
      throw new Error(
        `401 Unauthorized\n` +
          `aud=${decoded?.aud}\n` +
          `exp=${decoded?.exp ? new Date(decoded.exp * 1000) : 'unknown'}\n` +
          `body=${body}`
      );
    }

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Failed to delete workspace data (${response.status()}): ${body}`);
    }

    log(`✅ Workspace data deleted for project "${projectName}" (ID: ${projectId})`, 'INFO');
  } finally {
    if (disposeAfter) {
      await context.dispose();
    }
  }
}
