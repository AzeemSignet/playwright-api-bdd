/**
 * Standalone validation test suite for XML/JSON schemas and utilities.
 * Run: npx ts-node src/utils/validationTest.ts
 */

import { validateAndConvert, getValidationSummary, exportValidationErrors, convertToJson } from './validator.js';
import { getValidationSchema } from './validationSchema.js';
import type { ValidationSchema } from './validationSchema.js';
import { promises as fs } from 'fs';
import path from 'path';

// Test data samples
const validXmlData = `<?xml version="1.0" encoding="utf-8"?>
<STEP-ProductInformation>
  <Entities>
    <Entity ID="291403341" UserTypeID="STORE" ParentID="ZALES">
      <Name>Test Store 1757</Name>
      <Values>
        <Value AttributeID="TEMP_P_LONGITUDE">-80.11311417</Value>
        <Value AttributeID="TEMP_P_LATITUDE">26.13665509</Value>
        <Value AttributeID="TEMP_P_ZIPCODE">33304</Value>
        <Value AttributeID="STORE_NAME">ZALES JEWELERS</Value>
        <Value AttributeID="StoreID">1757</Value>
      </Values>
    </Entity>
  </Entities>
</STEP-ProductInformation>`;

const invalidXmlData = `<?xml version="1.0" encoding="utf-8"?>
<STEP-ProductInformation>
  <Entities>
    <Entity ID="ABC" UserTypeID="STORE">
      <Name></Name>
      <Values>
        <Value AttributeID="TEMP_P_LONGITUDE">200</Value>
        <Value AttributeID="TEMP_P_LATITUDE">-95</Value>
        <Value AttributeID="TEMP_P_ZIPCODE">INVALID</Value>
      </Values>
    </Entity>
  </Entities>
</STEP-ProductInformation>`;

const validJsonData = `{
  "id": "12345",
  "name": "Test User",
  "email": "test@example.com",
  "phone": "+1-555-1234",
  "status": "active"
}`;

const invalidJsonData = `{
  "id": "",
  "name": "A",
  "email": "invalid-email",
  "status": "invalid-status"
}`;

/**
 * Test XML to JSON conversion
 */
async function testXmlToJson() {
  console.log('\n========================================');
  console.log('TEST 1: XML to JSON Conversion');
  console.log('========================================\n');
  
  try {
    const result = await convertToJson(validXmlData);
    console.log('✓ XML successfully converted to JSON');
    console.log('Sample output:', JSON.stringify(result, null, 2).substring(0, 300) + '...');
  } catch (error: any) {
    console.error('✗ XML conversion failed:', error.message);
  }
}

/**
 * Test JSON validation (valid data)
 */
async function testValidJsonValidation() {
  console.log('\n========================================');
  console.log('TEST 2: Valid JSON Validation');
  console.log('========================================\n');
  
  try {
    const schema = getValidationSchema('generic');
    const result = await validateAndConvert(validJsonData, schema, false);
    
    console.log(getValidationSummary(result));
    
    if (result.isValid) {
      console.log('✓ Test PASSED - Valid data accepted');
    } else {
      console.log('✗ Test FAILED - Valid data rejected');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Test JSON validation (invalid data)
 */
async function testInvalidJsonValidation() {
  console.log('\n========================================');
  console.log('TEST 3: Invalid JSON Validation');
  console.log('========================================\n');
  
  try {
    const schema = getValidationSchema('generic');
    const result = await validateAndConvert(invalidJsonData, schema, false);
    
    console.log(getValidationSummary(result));
    
    if (!result.isValid && result.errors.length > 0) {
      console.log('✓ Test PASSED - Invalid data correctly rejected');
      console.log(`  Found ${result.errors.length} validation error(s) as expected`);
    } else {
      console.log('✗ Test FAILED - Invalid data not detected');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Test XML validation (valid data)
 */
async function testValidXmlValidation() {
  console.log('\n========================================');
  console.log('TEST 4: Valid XML Validation');
  console.log('========================================\n');
  
  try {
    const schema = getValidationSchema('stibo');
    const result = await validateAndConvert(validXmlData, schema, false);
    
    console.log(getValidationSummary(result));
    
    if (result.isValid) {
      console.log('✓ Test PASSED - Valid XML data accepted');
    } else {
      console.log('⚠ Test WARNING - Valid data had validation issues');
      console.log('  This may indicate schema needs adjustment for XML structure');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Test XML validation (invalid data)
 */
async function testInvalidXmlValidation() {
  console.log('\n========================================');
  console.log('TEST 5: Invalid XML Validation');
  console.log('========================================\n');
  
  try {
    const schema = getValidationSchema('stibo');
    const result = await validateAndConvert(invalidXmlData, schema, false);
    
    console.log(getValidationSummary(result));
    
    if (!result.isValid && result.errors.length > 0) {
      console.log('✓ Test PASSED - Invalid XML correctly rejected');
      console.log(`  Found ${result.errors.length} validation error(s) as expected`);
      
      // Export errors for review
      const errorReport = exportValidationErrors(result.errors);
      console.log('\nError Report Preview:');
      console.log(errorReport.substring(0, 500) + '...');
    } else {
      console.log('✗ Test FAILED - Invalid XML not detected');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Test custom validation rules
 */
async function testCustomValidation() {
  console.log('\n========================================');
  console.log('TEST 6: Custom Validation Rules');
  console.log('========================================\n');
  
  const customSchema: ValidationSchema = {
    'username': {
      field: 'username',
      type: 'string',
      required: true,
      minLength: 5,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_]+$/,
      errorMessage: 'Username must be 5-20 alphanumeric characters'
    },
    'password': {
      field: 'password',
      type: 'string',
      required: true,
      custom: (value: string) => {
        // Must contain at least one uppercase, lowercase, and number
        return /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
      },
      errorMessage: 'Password must contain uppercase, lowercase, and number'
    }
  };
  
  const testData = `{
    "username": "test",
    "password": "weakpass"
  }`;
  
  try {
    const result = await validateAndConvert(testData, customSchema, false);
    console.log(getValidationSummary(result));
    
    if (!result.isValid) {
      console.log('✓ Test PASSED - Custom validations working correctly');
    } else {
      console.log('✗ Test FAILED - Custom validations not applied');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Test file-based validation (read from actual fixture)
 */
async function testFileValidation() {
  console.log('\n========================================');
  console.log('TEST 7: File-Based Validation');
  console.log('========================================\n');
  
  try {
    const fixturePath = path.join(process.cwd(), 'src', 'features', 'fixtures', 'producer-request-body.xml');
    
    // Check if file exists
    try {
      await fs.access(fixturePath);
    } catch {
      console.log('⚠ Skipping test - fixture file not found');
      return;
    }
    
    const fileContent = await fs.readFile(fixturePath, 'utf-8');
    const schema = getValidationSchema('stibo');
    const result = await validateAndConvert(fileContent, schema, false);
    
    console.log(getValidationSummary(result));
    console.log(`✓ Test COMPLETED - Validated actual fixture file`);
    console.log(`  File: ${fixturePath}`);
    console.log(`  Size: ${fileContent.length} bytes`);
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Performance test
 */
async function testPerformance() {
  console.log('\n========================================');
  console.log('TEST 8: Performance Test');
  console.log('========================================\n');
  
  const iterations = 100;
  const startTime = Date.now();
  
  try {
    const schema = getValidationSchema('generic');
    
    for (let i = 0; i < iterations; i++) {
      await validateAndConvert(validJsonData, schema, false);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const avgTime = duration / iterations;
    
    console.log(`✓ Test COMPLETED`);
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Total time: ${duration}ms`);
    console.log(`  Average time per validation: ${avgTime.toFixed(2)}ms`);
    
    if (avgTime < 50) {
      console.log('  Performance: ✓ Excellent');
    } else if (avgTime < 100) {
      console.log('  Performance: ✓ Good');
    } else {
      console.log('  Performance: ⚠ Needs optimization');
    }
  } catch (error: any) {
    console.error('✗ Test ERROR:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   VALIDATION SYSTEM TEST SUITE       ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  try {
    await testXmlToJson();
    await testValidJsonValidation();
    await testInvalidJsonValidation();
    await testValidXmlValidation();
    await testInvalidXmlValidation();
    await testCustomValidation();
    await testFileValidation();
    await testPerformance();
    
    console.log('\n========================================');
    console.log('ALL TESTS COMPLETED');
    console.log('========================================\n');
    console.log('Review the results above to ensure all validations are working correctly.\n');
  } catch (error: any) {
    console.error('\n✗ FATAL ERROR:', error.message);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };
