/**
 * Utility to inspect parsed XML structure and common field paths.
 * Run: npx tsx src/utils/xmlInspector.ts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { xmlToJson } from './validator.js';

const SHOW_FULL_JSON = process.env.XML_INSPECTOR_FULL_JSON === 'true';
const MAX_JSON_OUTPUT_CHARS = 2000;

/**
 * Print object structure with indentation
 */
function printStructure(obj: any, indent: string = '', maxDepth: number = 5, currentDepth: number = 0): void {
  if (currentDepth >= maxDepth) {
    console.log(`${indent}... (max depth reached)`);
    return;
  }

  if (obj === null || obj === undefined) {
    console.log(`${indent}${obj}`);
    return;
  }

  if (typeof obj !== 'object') {
    const valueStr = String(obj);
    const value = valueStr.substring(0, 50);
    const suffix = valueStr.length > 50 ? '...' : '';
    console.log(`${indent}"${value}${suffix}"`);
    return;
  }

  if (Array.isArray(obj)) {
    console.log(`${indent}Array (${obj.length} items)`);
    if (obj.length > 0) {
      console.log(`${indent}  [0]:`);
      printStructure(obj[0], indent + '    ', maxDepth, currentDepth + 1);
    }
    return;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    const value = obj[key];
    const type = Array.isArray(value) ? 'Array' : typeof value;
    
    if (type === 'object' && value !== null) {
      console.log(`${indent}${key}: {}`);
      printStructure(value, indent + '  ', maxDepth, currentDepth + 1);
    } else if (type === 'Array') {
      console.log(`${indent}${key}: []`);
      printStructure(value, indent + '  ', maxDepth, currentDepth + 1);
    } else {
      const val = String(value).substring(0, 50);
      console.log(`${indent}${key}: ${type} = "${val}${String(value).length > 50 ? '...' : ''}"`);
    }
  }
}

/**
 * Inspect XML file structure
 */
async function inspectXmlFile(filePath: string) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          XML Structure Inspector                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log(`Reading file: ${filePath}\n`);
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    
    console.log(`File size: ${xmlContent.length} bytes\n`);
    console.log('Converting XML to JSON...\n');
    
    const jsonData = await xmlToJson(xmlContent);
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('PARSED JSON STRUCTURE:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    printStructure(jsonData, '', 6, 0);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('FIELD PATH EXAMPLES (GENERIC):');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const rootKeys = Object.keys(jsonData);
    if (rootKeys.length === 0) {
      console.log('✗ No top-level keys found in parsed JSON.');
    } else {
      console.log(`✓ Top-level keys (${rootKeys.length}): ${rootKeys.slice(0, 10).join(', ')}`);

      const rootKey = rootKeys[0];
      const rootValue = jsonData[rootKey];
      console.log(`\nExample root path: ${rootKey}`);

      if (rootValue && typeof rootValue === 'object') {
        const childKeys = Object.keys(rootValue);
        if (childKeys.length > 0) {
          const childKey = childKeys[0];
          console.log(`Example child path: ${rootKey}.${childKey}`);

          const childValue = rootValue[childKey];
          if (Array.isArray(childValue) && childValue.length > 0) {
            console.log(`Example array path: ${rootKey}.${childKey}[0]`);
          } else if (childValue && typeof childValue === 'object') {
            const grandChildKeys = Object.keys(childValue);
            if (grandChildKeys.length > 0) {
              console.log(`Example nested path: ${rootKey}.${childKey}.${grandChildKeys[0]}`);
            }
          }
        }
      }
    }
    
    if (SHOW_FULL_JSON) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('FULL JSON OUTPUT:');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(JSON.stringify(jsonData, null, 2).substring(0, MAX_JSON_OUTPUT_CHARS));
      console.log('\n... (truncated)\n');
    } else {
      console.log('\nFull JSON output skipped. Set XML_INSPECTOR_FULL_JSON=true to print it.');
    }
    
  } catch (error: any) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
  }
}

// Main execution
const fixturePath = path.join(process.cwd(), 'src', 'features', 'fixtures', 'producer-request-body.xml');
inspectXmlFile(fixturePath).catch(console.error);
