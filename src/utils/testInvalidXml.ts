/**
 * Test script that validates a known-invalid XML fixture and prints errors.
 * Run: npx tsx src/utils/testInvalidXml.ts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { validateAndConvert, getValidationSummary, exportValidationErrors } from './validator.js';
import { getValidationSchema } from './validationSchema.js';

async function testInvalidXml() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          INVALID XML VALIDATION TEST                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const invalidXmlPath = path.join(process.cwd(), 'src', 'features', 'fixtures', 'producer-request-body-invalid.xml');
  
  try {
    // Read the invalid XML file
    console.log(`Reading invalid XML file: ${invalidXmlPath}\n`);
    const xmlContent = await fs.readFile(invalidXmlPath, 'utf-8');
    console.log(`File size: ${xmlContent.length} bytes\n`);
    
    // Get validation schema
    const schema = getValidationSchema('stibo');
    
    // Validate the XML
    console.log('Starting validation...\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const result = await validateAndConvert(xmlContent, schema, true);
    
    // Print summary
    console.log('\n' + getValidationSummary(result));
    
    // Print detailed error analysis
    if (!result.isValid) {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║          DETAILED ERROR ANALYSIS                               ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
      
      result.errors.forEach((error, index) => {
        console.log(`ERROR #${index + 1}:`);
        console.log(`  Field:     ${error.field}`);
        console.log(`  Value:     ${JSON.stringify(error.value)}`);
        console.log(`  Rule:      ${error.rule}`);
        console.log(`  Message:   ${error.message}`);
        console.log(`  Timestamp: ${error.timestamp}`);
        console.log('');
      });
      
      // Save error report
      const errorReport = exportValidationErrors(result.errors);
      const errorFilePath = path.join(process.cwd(), 'test-reports', 'validation-test-invalid.json');
      await fs.writeFile(errorFilePath, errorReport, 'utf-8');
      console.log(`\n✓ Error report saved to: ${errorFilePath}\n`);
      
      // Show what would happen in real scenario
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('IN REAL API TEST SCENARIO:');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('⚠  WARNING: Validation detected issues');
      console.log(`⚠  ${result.errors.length} validation error(s) found`);
      console.log('⚠  Request would proceed with warnings logged');
      console.log('⚠  Error report would be saved for review');
      console.log('═══════════════════════════════════════════════════════════════\n');
    } else {
      console.log('\n✓ All validations passed (unexpected - file should have errors)\n');
    }
    
    // Show converted JSON preview
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('CONVERTED JSON PREVIEW:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(JSON.stringify(result.convertedData, null, 2).substring(0, 1500));
    console.log('\n... (truncated)\n');
    
  } catch (error: any) {
    console.error('\n✗ Test failed with error:', error.message);
    console.error(error.stack);
  }
}

// Run test
testInvalidXml().catch(console.error);
