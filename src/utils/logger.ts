/**
 * Buffered logger for test execution, writing to test-reports/execution.log.
 */
import { promises as fs } from 'fs';
import path from 'path';

const LOG_DIR = 'test-reports';
const LOG_FILE = path.join(LOG_DIR, 'execution.log');
let logBuffer: string[] = [];

// Ensure log directory exists
async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

export async function initializeLogger(): Promise<void> {
  await ensureLogDir();
  // Clear previous logs
  await fs.writeFile(LOG_FILE, `[${new Date().toISOString()}] Test Execution Started\n`);
}

export function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  // Add to buffer
  logBuffer.push(logMessage);
  
  // Also log to console
  // eslint-disable-next-line no-console
  console.log(logMessage);
}

export async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  
  try {
    const content = logBuffer.join('\n') + '\n';
    await fs.appendFile(LOG_FILE, content);
    logBuffer = [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write logs:', err);
  }
}

export async function logRequest(method: string, url: string, headers?: Record<string, string>, body?: string): Promise<void> {
  log(`→ Request: ${method} ${url}`, 'INFO');
  if (headers && Object.keys(headers).length > 0) {
    log(`  Headers: ${JSON.stringify(headers)}`, 'INFO');
  }
  if (body) {
    const bodyPreview = body.length > 500 ? body.substring(0, 500) + '...[truncated]' : body;
    log(`  Body: ${bodyPreview}`, 'INFO');
  }
  await flushLogs();
}

export async function logResponse(status: number, headers?: Record<string, string>, body?: string): Promise<void> {
  log(`← Response Status: ${status}`, 'INFO');
  if (headers && Object.keys(headers).length > 0) {
    log(`  Headers: ${JSON.stringify(headers)}`, 'INFO');
  }
  if (body) {
    const bodyPreview = body.length > 500 ? body.substring(0, 500) + '...[truncated]' : body;
    log(`  Body: ${bodyPreview}`, 'INFO');
  }
  await flushLogs();
}

export async function logScenario(scenarioName: string): Promise<void> {
  log(`\n${'='.repeat(80)}`, 'INFO');
  log(`Scenario: ${scenarioName}`, 'INFO');
  log(`${'='.repeat(80)}`, 'INFO');
  await flushLogs();
}

export async function logStep(stepText: string): Promise<void> {
  log(`→ ${stepText}`, 'INFO');
  await flushLogs();
}

export async function logError(message: string, error?: any): Promise<void> {
  log(`ERROR: ${message}`, 'ERROR');
  if (error) {
    // Handle different error types
    if (typeof error === 'object') {
      log(`  ${JSON.stringify(error, null, 2)}`, 'ERROR');
    } else {
      log(`  ${error.toString()}`, 'ERROR');
    }
  }
  await flushLogs();
}

/**
 * Log validation errors in structured format
 */
export async function logValidationError(field: string, value: any, rule: string, message: string): Promise<void> {
  log(`VALIDATION ERROR:`, 'ERROR');
  log(`  Field: ${field}`, 'ERROR');
  log(`  Value: ${JSON.stringify(value)}`, 'ERROR');
  log(`  Rule: ${rule}`, 'ERROR');
  log(`  Message: ${message}`, 'ERROR');
  await flushLogs();
}

/**
 * Log validation summary
 */
export async function logValidationSummary(isValid: boolean, errorCount: number, warningCount: number): Promise<void> {
  log('', 'INFO');
  log('═══════════════════════════════════════════', 'INFO');
  log('        VALIDATION SUMMARY', 'INFO');
  log('═══════════════════════════════════════════', 'INFO');
  log(`Status: ${isValid ? '✓ PASSED' : '✗ FAILED'}`, isValid ? 'INFO' : 'ERROR');
  log(`Total Errors: ${errorCount}`, errorCount > 0 ? 'ERROR' : 'INFO');
  log(`Total Warnings: ${warningCount}`, warningCount > 0 ? 'WARN' : 'INFO');
  log('═══════════════════════════════════════════', 'INFO');
  log('', 'INFO');
  await flushLogs();
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
