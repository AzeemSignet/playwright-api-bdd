/**
 * Step definitions for CSV attribute validation scenarios.
 */
import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from 'chai';
import { CSVValidator } from '../utils/csvValidator.js';
import path from 'path';
import { FIXTURES } from '../config/fixtures.js';

let csvData: any[] = [];
let validationResults: any = null;

/**
 * Parse and load attributes from CSV file
 * 
 * @example
 * Given I load attributes from "fixtures/attributes.csv"
 */
Given('I load attributes from {string}', function (filePath: string) {
  const resolved = FIXTURES[filePath?.trim()] || filePath;
  const fullPath = path.join(process.cwd(), 'src/features', resolved);
  csvData = CSVValidator.parseCSV(fullPath);
  expect(csvData.length).to.be.greaterThan(0, 'CSV file should contain records');
});

/**
 * Validate attributes against specified rules
 * 
 * @example
 * When I validate attributes with the following rules:
 *   | field          | type      | required | minLength | maxLength |
 *   | ElementType    | string    | true     | 1         | 50        |
 *   | Value          | string    | false    | 0         | 500       |
 *   | EntityID       | number    | true     |           |           |
 *   | ExportTime     | date      | false    |           |           |
 *   | UseContextLocale | boolean | false    |           |           |
 */
When('I validate attributes with the following rules:', function (dataTable: DataTable) {
  const rows = dataTable.hashes();
  const rules: any[] = rows.map(row => ({
    field: row.field,
    type: row.type as any,
    required: row.required === 'true',
    minLength: row.minLength ? parseInt(row.minLength) : undefined,
    maxLength: row.maxLength ? parseInt(row.maxLength) : undefined,
    allowedValues: row.allowedValues ? row.allowedValues.split(',').map(v => v.trim()) : undefined,
    pattern: row.pattern ? new RegExp(row.pattern) : undefined
  }));

  validationResults = CSVValidator.validateAllRecords(csvData, rules);
});

/**
 * Validate attributes with specific data type examples
 * 
 * @example
 * When I validate attributes data types:
 *   | field          | type      | example                      |
 *   | ElementType    | string    | Value                        |
 *   | EntityID       | number    | 291403341                    |
 *   | ExportTime     | date      | 2023-12-10 01:35:48         |
 *   | UseContextLocale | boolean | false                        |
 *   | ID             | uuid      | 550e8400-e29b-41d4-a716...  |
 *   | Email          | email     | user@example.com            |
 *   | WebsiteURL     | url       | https://www.example.com     |
 */
When('I validate attributes data types:', function (dataTable: DataTable) {
  const rows = dataTable.hashes();
  
  rows.forEach(row => {
    const field = row.field?.trim();
    const type = row.type?.trim().toLowerCase();
    const example = row.example;

    if (!field || !type) {
      console.log('⚠️  Skipping row with missing field/type');
      return;
    }

    const fieldData = csvData
      .map((r: any) => r[field])
      .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
      .map(v => String(v));
    
    if (fieldData.length === 0) {
      console.log(`⚠️  Field '${field}' has no data to validate`);
      return;
    }

    const sampleValue = fieldData[0];
    if (sampleValue === undefined) {
      console.log(`⚠️  Field '${field}' has no sample value to validate`);
      return;
    }
    
    switch (type) {
      case 'string':
        validateStringType(field, sampleValue);
        break;
      case 'number':
        validateNumberType(field, sampleValue);
        break;
      case 'date':
        validateDateType(field, sampleValue);
        break;
      case 'boolean':
        validateBooleanType(field, sampleValue);
        break;
      case 'uuid':
        validateUUIDType(field, sampleValue);
        break;
      case 'email':
        validateEmailType(field, sampleValue);
        break;
      case 'url':
        validateURLType(field, sampleValue);
        break;
      default:
        throw new Error(`Unknown type: ${type}`);
    }
    
    console.log(`✓ Field '${field}' validated as ${type} (example: ${example ?? 'n/a'})`);
  });
});

/**
 * Assert validation results
 * 
 * @example
 * Then all attributes should be valid
 */
Then('all attributes should be valid', function () {
  expect(validationResults).to.exist;
  expect(validationResults.invalidRecords.length).to.equal(
    0,
    `Expected all records to be valid, but found ${validationResults.invalidRecords.length} invalid records:\n${
      validationResults.invalidRecords.map((r: any) => `Record ${r.index}: ${r.errors.join(', ')}`).join('\n')
    }`
  );
});

/**
 * Assert validation has expected number of valid records
 * 
 * @example
 * Then validation should have 6 valid records
 */
Then('validation should have {int} valid records', function (expectedCount: number) {
  expect(validationResults).to.exist;
  expect(validationResults.validRecords).to.equal(
    expectedCount,
    `Expected ${expectedCount} valid records, but got ${validationResults.validRecords}`
  );
});

/**
 * Assert validation has expected number of invalid records
 * 
 * @example
 * Then validation should have 0 invalid records
 */
Then('validation should have {int} invalid records', function (expectedCount: number) {
  expect(validationResults).to.exist;
  expect(validationResults.invalidRecords.length).to.equal(
    expectedCount,
    `Expected ${expectedCount} invalid records, but got ${validationResults.invalidRecords.length}`
  );
});

/**
 * Print validation results
 * 
 * @example
 * Then I print validation results
 */
Then('I print validation results', function () {
  if (!validationResults) {
    console.log('No validation results available');
    return;
  }

  console.log('\n========== CSV VALIDATION RESULTS ==========');
  console.log(`Total Records: ${validationResults.totalRecords}`);
  console.log(`Valid Records: ${validationResults.validRecords}`);
  console.log(`Invalid Records: ${validationResults.invalidRecords.length}`);
  
  if (validationResults.invalidRecords.length > 0) {
    console.log('\nInvalid Records Details:');
    validationResults.invalidRecords.forEach((record: any) => {
      console.log(`\n  Record #${record.index}:`);
      record.errors.forEach((error: string) => {
        console.log(`    - ${error}`);
      });
    });
  }
  console.log('===========================================\n');
});

// Helper validation functions
function validateStringType(field: string, value: string): void {
  expect(value).to.be.a('string', `Field '${field}' should be a string`);
  expect(value.length).to.be.greaterThan(0, `Field '${field}' should not be empty`);
}

function validateNumberType(field: string, value: string): void {
  const num = Number(value);
  expect(isNaN(num)).to.be.false;
  expect(num).to.be.a('number', `Field '${field}' should be a valid number`);
}

function validateDateType(field: string, value: string): void {
  const date = new Date(value);
  expect(isNaN(date.getTime())).to.be.false;
  expect(date).to.be.instanceof(Date, `Field '${field}' should be a valid date`);
}

function validateBooleanType(field: string, value: string): void {
  const validBooleans = ['true', 'false', 'yes', 'no', 'y', 'n', '0', '1'];
  expect(validBooleans).to.include(value.toLowerCase(), `Field '${field}' should be a valid boolean`);
}

function validateUUIDType(field: string, value: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(uuidPattern.test(value)).to.be.true;
  expect(value).to.match(uuidPattern, `Field '${field}' should be a valid UUID`);
}

function validateEmailType(field: string, value: string): void {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  expect(emailPattern.test(value)).to.be.true;
  expect(value).to.match(emailPattern, `Field '${field}' should be a valid email`);
}

function validateURLType(field: string, value: string): void {
  try {
    new URL(value);
    expect(true).to.be.true;
  } catch {
    expect(false).to.be.true;
    throw new Error(`Field '${field}' should be a valid URL`);
  }
}
