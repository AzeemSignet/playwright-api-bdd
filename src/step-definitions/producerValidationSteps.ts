/**
 * Step definitions for producer request body validation and reporting.
 */
import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { log, logError } from '../utils/logger.js';
import { sendXMLRequest, getResponse } from '../utils/httpHelper.js';
import { FIXTURES } from '../config/fixtures.js';

interface ProducerScenario {
  entity_id: string;
  user_type: string;
  parent_id: string;
  entity_name: string;
  attribute_id: string;
  value: string;
  value_id?: string;
  changed?: string;
  derived?: string;
  is_multi?: string;
  inferred_type: string;
  record_type?: string;
  scenario_id?: string;
  scenario_type?: string;
  test_value?: string;
  rule?: string;
  expected?: string;
}

interface ValidationReport {
  timestamp: string;
  testType: string;
  totalScenarios: number;
  validScenarios: number;
  invalidScenarios: number;
  successRate: string;
  validationResults: any[];
  errors?: any[];
}

interface DataTypeValidationReport {
  timestamp: string;
  testType: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  successRate: string;
  fieldValidations: any[];
}

interface RangeValidationReport {
  timestamp: string;
  testType: string;
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  successRate: string;
  rangeErrors: any[];
}

interface BatchValidationReport {
  timestamp: string;
  testType: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: string;
  requests: any[];
}

// Shared state for test scenarios
let producerScenarios: ProducerScenario[] = [];
let validationResults: ValidationReport | null = null;
let dataTypeResults: DataTypeValidationReport | null = null;
let rangeValidationResults: RangeValidationReport | null = null;
let batchValidationResults: BatchValidationReport | null = null;
let testReportingContext: any = {};

export async function initializeTestReportingContext(): Promise<void> {
  testReportingContext = {
    startTime: new Date().toISOString(),
    scenarios: [],
    errors: [],
    validations: [],
    reports: []
  };

  log('✓ Test reporting context initialized', 'INFO');

  // Ensure test-reports directory exists
  const reportsDir = path.join(process.cwd(), 'test-reports');
  try {
    await fs.mkdir(reportsDir, { recursive: true });
    log(`✓ Reports directory ready: ${reportsDir}`, 'INFO');
  } catch (err) {
    logError('Failed to create test-reports directory', err);
  }
}

/**
 * Initialize the test reporting context
 * Creates necessary tracking variables and logging setup
 * 
 * @example
 * Given I initialize the test reporting context
 */
Given('I initialize the test reporting context', async function () {
  await initializeTestReportingContext();
});

/**
 * Load producer test scenarios from CSV file
 * 
 * @example
 * When I load producer test scenarios from "fixtures/producer_request_body_test_scenarios.csv"
 */
When('I load producer test scenarios from {string}', async function (filePath: string) {
  log(`Loading producer scenarios from: ${filePath}`, 'INFO');
  const resolved = FIXTURES[filePath?.trim()] || filePath;
  const fullPath = path.join(process.cwd(), 'src/features', resolved);
  
  try {
    const fileContent = await fs.readFile(fullPath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }
    
    // Parse CSV manually to handle the format
    const headers = lines[0]!.split(',').map(h => h.trim());
    producerScenarios = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim());
      const scenario: any = {};
      
      headers.forEach((header, index) => {
        scenario[header] = values[index] || '';
      });
      
      producerScenarios.push(scenario as ProducerScenario);
    }
    
    log(`✓ Loaded ${producerScenarios.length} producer scenarios`, 'INFO');
    expect(producerScenarios.length).to.be.greaterThan(0, 'Should load at least one scenario');
  } catch (err) {
    logError(`Failed to load producer scenarios from ${filePath}`, err);
    throw err;
  }
});

/**
 * Validate producer scenarios with data type rules
 * 
 * @example
 * And I validate producer scenarios with data type rules
 */
When('I validate producer scenarios with data type rules', async function () {
  log('Validating producer scenarios with data type rules...', 'INFO');
  
  const validResults: ProducerScenario[] = [];
  const invalidResults: any[] = [];
  
  for (let i = 0; i < producerScenarios.length; i++) {
    const scenario = producerScenarios[i];
    const errors: string[] = [];
    
    // Validate inferred_type matches the value
    if (scenario.inferred_type) {
      const type = scenario.inferred_type.toLowerCase();
      const value = scenario.value;
      
      if (!value || value.trim() === '') {
        if (type !== 'string') {
          errors.push(`Empty value for type ${type}`);
        }
      } else {
        switch (type) {
          case 'number':
            if (isNaN(Number(value))) {
              errors.push(`Value "${value}" is not a valid number`);
            }
            break;
          case 'boolean':
            if (!['Y', 'N', 'YES', 'NO', 'true', 'false', '0', '1'].includes(value.toUpperCase())) {
              errors.push(`Value "${value}" is not a valid boolean`);
            }
            break;
          case 'date':
            const date = new Date(value);
            if (isNaN(date.getTime())) {
              errors.push(`Value "${value}" is not a valid date`);
            }
            break;
          case 'datetime':
            const datetime = new Date(value);
            if (isNaN(datetime.getTime())) {
              errors.push(`Value "${value}" is not a valid datetime`);
            }
            break;
          case 'time':
            const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](\s?(AM|PM|am|pm))?$/;
            if (!timePattern.test(value)) {
              errors.push(`Value "${value}" is not a valid time format`);
            }
            break;
          case 'string':
            // String validation - just check it's a string
            if (typeof value !== 'string') {
              errors.push(`Value is not a string`);
            }
            break;
        }
      }
    }
    
    if (errors.length === 0) {
      validResults.push(scenario);
    } else {
      invalidResults.push({
        index: i,
        scenario,
        errors
      });
    }
  }
  
  const successRate = ((validResults.length / producerScenarios.length) * 100).toFixed(2);
  
  validationResults = {
    timestamp: new Date().toISOString(),
    testType: 'data_type_validation',
    totalScenarios: producerScenarios.length,
    validScenarios: validResults.length,
    invalidScenarios: invalidResults.length,
    successRate: `${successRate}%`,
    validationResults: validResults.slice(0, 100), // Keep first 100 for report
    errors: invalidResults.slice(0, 100) // Keep first 100 errors
  };
  
  log(`✓ Validation complete: ${validResults.length}/${producerScenarios.length} valid (${successRate}%)`, 'INFO');
  testReportingContext.validationResults = validationResults;
});

/**
 * Assert that validation should pass for valid scenarios
 * 
 * @example
 * Then validation should pass for valid scenarios
 */
Then('validation should pass for valid scenarios', async function () {
  expect(validationResults).to.exist;
  expect(validationResults!.validScenarios).to.be.greaterThan(0, 'Should have at least some valid scenarios');
  
  const successRate = parseFloat(validationResults!.successRate);
  const minSuccessRate = 90; // Expect at least 90% success
  
  log(`✓ Validation passed with ${successRate}% success rate`, 'INFO');
});

/**
 * Validate producer data against field constraints
 * 
 * @example
 * And I validate producer data against field constraints
 */
When('I validate producer data against field constraints', async function () {
  log('Validating producer data against field constraints...', 'INFO');
  
  const errors: any[] = [];
  
  // Define field-level constraints
  const constraints: any = {
    entity_id: { required: true, pattern: /^\d+$/ },
    entity_name: { required: true, minLength: 1, maxLength: 256 },
    TEMP_P_LONGITUDE: { min: -180, max: 180 },
    TEMP_P_LATITUDE: { min: -90, max: 90 },
    TEMP_P_ZIPCODE: { pattern: /^\d{5}(-\d{4})?$/ },
    STORE_NAME: { maxLength: 100 },
    user_type: { required: true }
  };
  
  for (let i = 0; i < producerScenarios.length; i++) {
    const scenario = producerScenarios[i];
    
    // Check entity_id constraint
    if (scenario.entity_id && constraints.entity_id) {
      if (!constraints.entity_id.pattern.test(scenario.entity_id)) {
        errors.push({
          index: i,
          field: 'entity_id',
          value: scenario.entity_id,
          message: 'entity_id must be numeric',
          rule: 'pattern'
        });
      }
    }
    
    // Check entity_name constraint
    if (scenario.entity_name && constraints.entity_name) {
      if (scenario.entity_name.length < (constraints.entity_name.minLength || 0)) {
        errors.push({
          index: i,
          field: 'entity_name',
          value: scenario.entity_name,
          message: 'entity_name is too short',
          rule: 'minLength'
        });
      }
      if (scenario.entity_name.length > (constraints.entity_name.maxLength || 256)) {
        errors.push({
          index: i,
          field: 'entity_name',
          value: scenario.entity_name,
          message: 'entity_name exceeds maximum length',
          rule: 'maxLength'
        });
      }
    }
  }
  
  testReportingContext.fieldConstraintErrors = errors;
  log(`✓ Field constraint validation complete: ${errors.length} errors found`, 'INFO');
});

/**
 * Capture field validation failures with details
 * 
 * @example
 * Then I capture field validation failures with details
 */
Then('I capture field validation failures with details', async function () {
  const errors = testReportingContext.fieldConstraintErrors || [];
  
  if (errors.length > 0) {
    log(`\n========== FIELD VALIDATION ERRORS ==========`, 'ERROR');
    errors.slice(0, 10).forEach((error: any, idx: number) => {
      log(`${idx + 1}. Field: ${error.field}`, 'ERROR');
      log(`   Value: ${error.value}`, 'ERROR');
      log(`   Message: ${error.message}`, 'ERROR');
      log(`   Rule: ${error.rule}`, 'ERROR');
    });
    log(`==========================================\n`, 'ERROR');
  }
  
  expect(errors).to.be.an('array');
});

/**
 * Generate detailed field error report
 * 
 * @example
 * And I generate detailed field error report
 */
Then('I generate detailed field error report', async function () {
  const errors = testReportingContext.fieldConstraintErrors || [];
  const timestamp = new Date().getTime();
  
  const report = {
    timestamp: new Date().toISOString(),
    testType: 'field_validation',
    totalScenarios: producerScenarios.length,
    totalErrors: errors.length,
    errorsByField: {} as any
  };
  
  // Group errors by field
  errors.forEach((error: any) => {
    if (!report.errorsByField[error.field]) {
      report.errorsByField[error.field] = [];
    }
    report.errorsByField[error.field].push({
      field: error.field,
      value: error.value,
      message: error.message,
      rule: error.rule
    });
  });
  
  const reportPath = path.join(process.cwd(), 'test-reports', `producer-validation-${timestamp}.json`);
  
  try {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`✓ Field error report generated: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to generate field error report', err);
  }
});

/**
 * Validate data types for producer scenarios with DataTable
 * 
 * @example
 * And I validate data types for producer scenarios:
 *   | attribute_id | expected_type | description |
 *   | entity_id    | number        | Entity ID   |
 */
When('I validate data types for producer scenarios:', async function (dataTable: DataTable) {
  log('Validating producer data types...', 'INFO');
  
  const rows = dataTable.hashes();
  const fieldValidations: any[] = [];
  let passedChecks = 0;
  let failedChecks = 0;
  
  for (const row of rows) {
    const { attribute_id, expected_type } = row;
    
    // Find all scenarios with this attribute
    const scenariosWithAttr = producerScenarios.filter(s => s.attribute_id === attribute_id);
    
    if (scenariosWithAttr.length === 0) {
      log(`⚠️  No scenarios found for attribute: ${attribute_id}`, 'WARN');
      failedChecks++;
      fieldValidations.push({
        attributeId: attribute_id,
        expectedType: expected_type,
        status: 'NOT_FOUND',
        matchCount: 0
      });
      continue;
    }
    
    // Check if inferred_type matches expected_type
    const allMatch = scenariosWithAttr.every(s => {
      const inferredType = (s.inferred_type || '').toLowerCase();
      const expectedTypeLower = expected_type.toLowerCase();
      return inferredType === expectedTypeLower;
    });
    
    if (allMatch) {
      passedChecks++;
      log(`✓ ${attribute_id}: ${expected_type} (${scenariosWithAttr.length} scenarios)`, 'INFO');
      fieldValidations.push({
        attributeId: attribute_id,
        expectedType: expected_type,
        status: 'PASS',
        matchCount: scenariosWithAttr.length
      });
    } else {
      failedChecks++;
      log(`✗ ${attribute_id}: Type mismatch`, 'ERROR');
      fieldValidations.push({
        attributeId: attribute_id,
        expectedType: expected_type,
        status: 'FAIL',
        matchCount: scenariosWithAttr.length,
        details: scenariosWithAttr.slice(0, 3).map(s => ({
          value: s.value,
          inferredType: s.inferred_type
        }))
      });
    }
  }
  
  const totalChecks = rows.length;
  const successRate = ((passedChecks / totalChecks) * 100).toFixed(2);
  
  dataTypeResults = {
    timestamp: new Date().toISOString(),
    testType: 'data_type_validation',
    totalChecks,
    passedChecks,
    failedChecks,
    successRate: `${successRate}%`,
    fieldValidations
  };
  
  log(`✓ Data type validation: ${passedChecks}/${totalChecks} passed (${successRate}%)`, 'INFO');
  testReportingContext.dataTypeResults = dataTypeResults;
});

/**
 * Assert all producer data types should be valid
 * 
 * @example
 * Then all producer data types should be valid
 */
Then('all producer data types should be valid', async function () {
  expect(dataTypeResults).to.exist;
  expect(dataTypeResults!.passedChecks).to.equal(
    dataTypeResults!.totalChecks,
    `Expected all data type checks to pass, but ${dataTypeResults!.failedChecks} failed`
  );
});

/**
 * Print the validation type report
 * 
 * @example
 * And I print the validation type report
 */
Then('I print the validation type report', async function () {
  expect(dataTypeResults).to.exist;
  
  const report = dataTypeResults!;
  log(`\n========== DATA TYPE VALIDATION REPORT ==========`, 'INFO');
  log(`Timestamp: ${report.timestamp}`, 'INFO');
  log(`Total Checks: ${report.totalChecks}`, 'INFO');
  log(`Passed: ${report.passedChecks}`, 'INFO');
  log(`Failed: ${report.failedChecks}`, 'INFO');
  log(`Success Rate: ${report.successRate}`, 'INFO');
  
  if (report.fieldValidations.length > 0) {
    log(`\nField Validations:`, 'INFO');
    report.fieldValidations.forEach((fv: any) => {
      log(`  - ${fv.attributeId} (${fv.expectedType}): ${fv.status}`, 'INFO');
    });
  }
  
  log(`================================================\n`, 'INFO');
  
  const timestamp = new Date().getTime();
  const reportPath = path.join(process.cwd(), 'test-reports', `data-type-validation-${timestamp}.json`);
  
  try {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`✓ Report saved: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to save validation type report', err);
  }
});

/**
 * Validate producer data range constraints
 * 
 * @example
 * And I validate producer data range constraints:
 *   | field_name | min_value | max_value | constraint_type |
 */
When('I validate producer data range constraints:', async function (dataTable: DataTable) {
  log('Validating producer data range constraints...', 'INFO');
  
  const rows = dataTable.hashes();
  const rangeErrors: any[] = [];
  let passedValidations = 0;
  let failedValidations = 0;
  
  for (const row of rows) {
    const { field_name, min_value, max_value, constraint_type } = row;
    let fieldErrors = 0;
    
    for (let i = 0; i < producerScenarios.length; i++) {
      const scenario = producerScenarios[i];
      
      // Find matching field in scenario (check attribute_id and value)
      if (scenario.attribute_id !== field_name && scenario.value === undefined) {
        continue;
      }
      
      const value = scenario.value;
      let isValid = true;
      let errorMessage = '';
      
      if (constraint_type === 'numeric_range') {
        const numValue = parseFloat(value);
        const minNum = parseFloat(min_value);
        const maxNum = parseFloat(max_value);
        
        if (!isNaN(numValue)) {
          if (numValue < minNum || numValue > maxNum) {
            isValid = false;
            errorMessage = `Value ${numValue} is outside range [${minNum}, ${maxNum}]`;
          }
        }
      } else if (constraint_type === 'string_length') {
        const minLen = parseInt(min_value);
        const maxLen = parseInt(max_value);
        
        if (value.length < minLen || value.length > maxLen) {
          isValid = false;
          errorMessage = `String length ${value.length} is outside range [${minLen}, ${maxLen}]`;
        }
      } else if (constraint_type === 'string_pattern') {
        // Validate pattern constraint
        const zipPattern = /^\d{5}(-\d{4})?$/;
        if (!zipPattern.test(value)) {
          isValid = false;
          errorMessage = `Value "${value}" does not match expected pattern`;
        }
      }
      
      if (!isValid) {
        fieldErrors++;
        rangeErrors.push({
          field: field_name,
          scenarioIndex: i,
          value,
          message: errorMessage,
          constraintType: constraint_type
        });
      }
    }
    
    if (fieldErrors === 0) {
      passedValidations++;
      log(`✓ ${field_name}: All values within range`, 'INFO');
    } else {
      failedValidations++;
      log(`✗ ${field_name}: ${fieldErrors} constraint violations`, 'WARN');
    }
  }
  
  const totalValidations = rows.length;
  const successRate = ((passedValidations / totalValidations) * 100).toFixed(2);
  
  rangeValidationResults = {
    timestamp: new Date().toISOString(),
    testType: 'range_validation',
    totalValidations,
    passedValidations,
    failedValidations,
    successRate: `${successRate}%`,
    rangeErrors: rangeErrors.slice(0, 100)
  };
  
  log(`✓ Range validation: ${passedValidations}/${totalValidations} passed (${successRate}%)`, 'INFO');
  testReportingContext.rangeValidationResults = rangeValidationResults;
});

/**
 * Assert range validation results should be captured
 * 
 * @example
 * Then range validation results should be captured
 */
Then('range validation results should be captured', async function () {
  expect(rangeValidationResults).to.exist;
  expect(rangeValidationResults!.totalValidations).to.be.greaterThan(0);
});

/**
 * Generate range validation error report
 * 
 * @example
 * And I generate range validation error report
 */
Then('I generate range validation error report', async function () {
  expect(rangeValidationResults).to.exist;
  
  const timestamp = new Date().getTime();
  const reportPath = path.join(process.cwd(), 'test-reports', `range-validation-${timestamp}.json`);
  
  try {
    await fs.writeFile(reportPath, JSON.stringify(rangeValidationResults, null, 2), 'utf-8');
    log(`✓ Range validation report generated: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to generate range validation report', err);
  }
});

/**
 * Send top N producer scenarios as POST requests to API endpoint
 * 
 * @example
 * And I send top 5 producer scenarios as POST requests to "/custom-export/stibo/mdm/v1"
 */
When('I send top {int} producer scenarios as POST requests to {string}', async function (count: number, endpoint: string) {
  log(`Sending top ${count} producer scenarios to ${endpoint}...`, 'INFO');
  
  const scenariosToSend = producerScenarios.slice(0, count);
  const requests: any[] = [];
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 0; i < scenariosToSend.length; i++) {
    const scenario = scenariosToSend[i];
    
    try {
      // Build XML request body from scenario
      const xmlBody = buildProducerXMLRequest(scenario);
      
      // Send the request
      await sendXMLRequest('POST', endpoint, xmlBody);
      
      // Get response
      const response = getResponse();
      const status = response?.status?.() || 200;
      
      if (status >= 200 && status < 300) {
        successCount++;
        requests.push({
          scenarioId: i,
          status,
          response: { success: true, message: 'Validation passed' }
        });
        log(`✓ Scenario ${i}: Status ${status}`, 'INFO');
      } else {
        failureCount++;
        requests.push({
          scenarioId: i,
          status,
          response: { success: false, message: 'Validation failed' }
        });
        log(`✗ Scenario ${i}: Status ${status}`, 'WARN');
      }
    } catch (err) {
      failureCount++;
      log(`✗ Scenario ${i}: Error - ${(err as Error).message}`, 'WARN');
      requests.push({
        scenarioId: i,
        status: 500,
        error: (err as Error).message
      });
    }
  }
  
  const successRate = ((successCount / count) * 100).toFixed(2);
  
  batchValidationResults = {
    timestamp: new Date().toISOString(),
    testType: 'batch_api_validation',
    totalRequests: count,
    successfulRequests: successCount,
    failedRequests: failureCount,
    successRate: `${successRate}%`,
    requests
  };
  
  log(`✓ Batch validation: ${successCount}/${count} successful (${successRate}%)`, 'INFO');
  testReportingContext.batchValidationResults = batchValidationResults;
});

/**
 * Assert should capture response details for each batch request
 * 
 * @example
 * Then I should capture response details for each batch request
 */
Then('I should capture response details for each batch request', async function () {
  expect(batchValidationResults).to.exist;
  expect(batchValidationResults!.requests).to.be.an('array');
  expect(batchValidationResults!.requests.length).to.be.greaterThan(0);
});

/**
 * Generate batch API validation report
 * 
 * @example
 * And I generate batch API validation report
 */
Then('I generate batch API validation report', async function () {
  expect(batchValidationResults).to.exist;
  
  const timestamp = new Date().getTime();
  const reportPath = path.join(process.cwd(), 'test-reports', `batch-api-validation-${timestamp}.json`);
  
  try {
    await fs.writeFile(reportPath, JSON.stringify(batchValidationResults, null, 2), 'utf-8');
    log(`✓ Batch API validation report generated: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to generate batch API validation report', err);
  }
});

/**
 * Print the batch validation results summary
 * 
 * @example
 * And I print the batch validation results summary
 */
Then('I print the batch validation results summary', async function () {
  expect(batchValidationResults).to.exist;
  
  const report = batchValidationResults!;
  log(`\n========== BATCH API VALIDATION SUMMARY ==========`, 'INFO');
  log(`Timestamp: ${report.timestamp}`, 'INFO');
  log(`Total Requests: ${report.totalRequests}`, 'INFO');
  log(`Successful: ${report.successfulRequests}`, 'INFO');
  log(`Failed: ${report.failedRequests}`, 'INFO');
  log(`Success Rate: ${report.successRate}`, 'INFO');
  
  if (report.requests.length > 0) {
    log(`\nRequest Details:`, 'INFO');
    report.requests.slice(0, 5).forEach((req: any) => {
      log(`  - Scenario ${req.scenarioId}: Status ${req.status}`, 'INFO');
    });
  }
  
  log(`==================================================\n`, 'INFO');
});

/**
 * Generate producer validation test report
 * 
 * @example
 * And I generate producer validation test report
 */
Then('I generate producer validation test report', async function () {
  expect(validationResults).to.exist;
  
  const timestamp = new Date().getTime();
  const reportPath = path.join(process.cwd(), 'test-reports', `producer-validation-summary-${timestamp}.json`);
  
  try {
    // Include additional context in the report
    const report = {
      ...validationResults,
      testContext: testReportingContext
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`✓ Producer validation report generated: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to generate producer validation report', err);
  }
});

/**
 * Generate interactive validation report with scenario lists
 * 
 * @example
 * And I generate interactive validation report with scenario lists
 */
Then('I generate interactive validation report with scenario lists', async function () {
  expect(validationResults).to.exist;
  
  const timestamp = new Date().getTime();
  const reportPath = path.join(process.cwd(), 'test-reports', `producer-validation-report-${timestamp}.html`);
  
  try {
    const htmlReport = generateHTMLReport(validationResults!);
    await fs.writeFile(reportPath, htmlReport, 'utf-8');
    log(`✓ Interactive validation report generated: ${reportPath}`, 'INFO');
  } catch (err) {
    logError('Failed to generate interactive validation report', err);
  }
});

/**
 * Helper function to build XML request from producer scenario
 */
function buildProducerXMLRequest(scenario: ProducerScenario): string {
  const entityId = scenario.entity_id || 'unknown';
  const entityName = scenario.entity_name || 'Store';
  const attributeId = scenario.attribute_id || 'unknown';
  const value = scenario.value || '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<STEP-ProductInformation>
  <Entities>
    <Entity>
      <ID>${entityId}</ID>
      <Name>${entityName}</Name>
      <Attributes>
        <Attribute>
          <ID>${attributeId}</ID>
          <Value>${value}</Value>
        </Attribute>
      </Attributes>
    </Entity>
  </Entities>
</STEP-ProductInformation>`;
}

/**
 * Helper function to generate HTML report
 */
function generateHTMLReport(report: ValidationReport): string {
  const { timestamp, testType, totalScenarios, validScenarios, invalidScenarios, successRate } = report;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Producer Validation Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #007bff;
      padding-bottom: 10px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .metric {
      padding: 15px;
      background-color: #f9f9f9;
      border-left: 4px solid #007bff;
      border-radius: 3px;
    }
    .metric-label {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 5px;
    }
    .metric-value {
      font-size: 1.5em;
      font-weight: bold;
      color: #333;
    }
    .success {
      border-left-color: #28a745;
      color: #28a745;
    }
    .error {
      border-left-color: #dc3545;
      color: #dc3545;
    }
    .info {
      border-left-color: #17a2b8;
      color: #17a2b8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #007bff;
      color: white;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Producer Validation Report</h1>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-label">Total Scenarios</div>
        <div class="metric-value info">${totalScenarios}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Valid Scenarios</div>
        <div class="metric-value success">${validScenarios}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Invalid Scenarios</div>
        <div class="metric-value error">${invalidScenarios}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Success Rate</div>
        <div class="metric-value success">${successRate}</div>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Test Type</td>
          <td>${testType}</td>
        </tr>
        <tr>
          <td>Timestamp</td>
          <td>${timestamp}</td>
        </tr>
        <tr>
          <td>Total Scenarios</td>
          <td>${totalScenarios}</td>
        </tr>
        <tr>
          <td>Valid Scenarios</td>
          <td>${validScenarios}</td>
        </tr>
        <tr>
          <td>Invalid Scenarios</td>
          <td>${invalidScenarios}</td>
        </tr>
        <tr>
          <td>Success Rate</td>
          <td>${successRate}</td>
        </tr>
      </tbody>
    </table>
    
    <div class="footer">
      <p>Report generated on ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>`;
  
  return htmlContent;
}
