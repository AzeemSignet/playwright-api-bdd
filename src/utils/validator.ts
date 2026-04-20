/**
 * Core validation engine for XML/JSON conversion, schema checks, and summaries.
 */
import { parseString, Builder } from 'xml2js';
import type { ValidationSchema } from './validationSchema.js';
import { log, logError } from './logger.js';

/**
 * Validation Rule Interface
 */
export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: any) => boolean;
  errorMessage?: string;
}

/**
 * Validation Error Interface
 */
export interface ValidationError {
  field: string;
  value: any;
  rule: string;
  message: string;
  timestamp: string;
}

/**
 * Validation Result Interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  convertedData: any;
}

/**
 * Convert XML string to JSON object
 */
export async function xmlToJson(xmlString: string): Promise<any> {
  return new Promise((resolve, reject) => {
    parseString(xmlString, {
      explicitArray: false,
      mergeAttrs: false,
      ignoreAttrs: false,
      trim: true,
      attrkey: '$',
      charkey: '_'
    }, (err, result) => {
      if (err) {
        reject(new Error(`XML parsing failed: ${err.message}`));
      } else {
        const normalize = (node: any): any => {
          if (Array.isArray(node)) {
            return node.map(item => normalize(item));
          }
          if (node && typeof node === 'object') {
            const hasAttrs = Object.prototype.hasOwnProperty.call(node, '$');
            const hasText = Object.prototype.hasOwnProperty.call(node, '_');
            const normalized: any = {};

            if (hasAttrs && node.$ && typeof node.$ === 'object') {
              Object.entries(node.$).forEach(([key, value]) => {
                normalized[key] = value;
              });
            }

            if (hasText) {
              const textValue = typeof node._ === 'string' ? node._.trim() : node._;
              if (typeof textValue === 'string' && /^-?\d+(\.\d+)?$/.test(textValue)) {
                normalized.Value = Number(textValue);
              } else {
                normalized.Value = textValue;
              }
            }

            Object.entries(node).forEach(([key, value]) => {
              if (key === '$' || key === '_') return;
              normalized[key] = normalize(value);
            });

            return normalized;
          }
          return node;
        };

        resolve(normalize(result));
      }
    });
  });
}

/**
 * Convert JSON object to XML string
 */
export function jsonToXml(jsonObject: any): string {
  const builder = new Builder({
    xmldec: { version: '1.0', encoding: 'utf-8' }
  });
  return builder.buildObject(jsonObject);
}

/**
 * Detect input format (XML or JSON)
 */
export function detectFormat(input: string): 'xml' | 'json' | 'unknown' {
  const trimmed = input.trim();
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    return 'xml';
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

/**
 * Convert any input (XML/JSON string) to standard JSON object
 */
export async function convertToJson(input: string): Promise<any> {
  const format = detectFormat(input);
  
  if (format === 'json') {
    return JSON.parse(input);
  } else if (format === 'xml') {
    return await xmlToJson(input);
  } else {
    throw new Error('Unsupported format: Input must be valid XML or JSON');
  }
}

/**
 * Extract value from nested object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Handle array of objects
    if (Array.isArray(current)) {
      const results = current.map(item => item[key]).filter(item => item !== undefined);
      return results.length > 0 ? results : undefined;
    }
    
    current = current[key];
  }
  
  return current;
}

/**
 * Validate a single field against a validation rule
 */
function validateField(fieldValue: any, rule: ValidationRule): ValidationError | null {
  const { field, type, required, minLength, maxLength, min, max, pattern, enum: enumValues, custom, errorMessage } = rule;
  
  // Check required
  if (required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
    return {
      field,
      value: fieldValue,
      rule: 'required',
      message: errorMessage || `${field} is required`,
      timestamp: new Date().toISOString()
    };
  }
  
  // Skip validation if field is not required and value is empty
  if (!required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
    return null;
  }
  
  // Type validation
  switch (type) {
    case 'string':
      if (typeof fieldValue !== 'string') {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be a string`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'number':
      const numValue = typeof fieldValue === 'string' ? parseFloat(fieldValue) : fieldValue;
      if (isNaN(numValue)) {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be a number`,
          timestamp: new Date().toISOString()
        };
      }
      
      // Min/Max validation for numbers
      if (min !== undefined && numValue < min) {
        return {
          field,
          value: fieldValue,
          rule: 'min',
          message: errorMessage || `${field} must be at least ${min}`,
          timestamp: new Date().toISOString()
        };
      }
      if (max !== undefined && numValue > max) {
        return {
          field,
          value: fieldValue,
          rule: 'max',
          message: errorMessage || `${field} must be at most ${max}`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'boolean':
      if (typeof fieldValue !== 'boolean' && fieldValue !== 'true' && fieldValue !== 'false') {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be a boolean`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'date':
      const dateValue = new Date(fieldValue);
      if (isNaN(dateValue.getTime())) {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be a valid date`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'email':
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(String(fieldValue))) {
        return {
          field,
          value: fieldValue,
          rule: 'pattern',
          message: errorMessage || `${field} must be a valid email`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'url':
      try {
        new URL(String(fieldValue));
      } catch {
        return {
          field,
          value: fieldValue,
          rule: 'pattern',
          message: errorMessage || `${field} must be a valid URL`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'array':
      if (!Array.isArray(fieldValue)) {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be an array`,
          timestamp: new Date().toISOString()
        };
      }
      break;
      
    case 'object':
      if (typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
        return {
          field,
          value: fieldValue,
          rule: 'type',
          message: errorMessage || `${field} must be an object`,
          timestamp: new Date().toISOString()
        };
      }
      break;
  }
  
  // String length validation
  if (type === 'string' && typeof fieldValue === 'string') {
    if (minLength !== undefined && fieldValue.length < minLength) {
      return {
        field,
        value: fieldValue,
        rule: 'minLength',
        message: errorMessage || `${field} must be at least ${minLength} characters`,
        timestamp: new Date().toISOString()
      };
    }
    if (maxLength !== undefined && fieldValue.length > maxLength) {
      return {
        field,
        value: fieldValue,
        rule: 'maxLength',
        message: errorMessage || `${field} must be at most ${maxLength} characters`,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Pattern validation
  if (pattern && !pattern.test(String(fieldValue))) {
    return {
      field,
      value: fieldValue,
      rule: 'pattern',
      message: errorMessage || `${field} does not match required pattern`,
      timestamp: new Date().toISOString()
    };
  }
  
  // Enum validation
  if (enumValues && !enumValues.includes(String(fieldValue))) {
    return {
      field,
      value: fieldValue,
      rule: 'enum',
      message: errorMessage || `${field} must be one of: ${enumValues.join(', ')}`,
      timestamp: new Date().toISOString()
    };
  }
  
  // Custom validation
  if (custom && !custom(fieldValue)) {
    return {
      field,
      value: fieldValue,
      rule: 'custom',
      message: errorMessage || `${field} failed custom validation`,
      timestamp: new Date().toISOString()
    };
  }
  
  return null;
}

/**
 * Validate data against validation schema
 */
export function validateData(data: any, schema: ValidationSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  
  // Validate each rule in schema
  for (const [fieldKey, rule] of Object.entries(schema)) {
    const fieldValue = getNestedValue(data, rule.field);
    const error = validateField(fieldValue, rule);
    
    if (error) {
      errors.push(error);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    convertedData: data
  };
}

/**
 * Validate and convert input (XML/JSON) to standard JSON with validation
 */
export async function validateAndConvert(
  input: string, 
  schema: ValidationSchema,
  logValidation: boolean = true
): Promise<ValidationResult> {
  try {
    // Convert to JSON
    log('Starting input validation and conversion', 'INFO');
    const jsonData = await convertToJson(input);
    
    if (logValidation) {
      log('Input successfully converted to JSON', 'INFO');
      log(`Converted data preview: ${JSON.stringify(jsonData).substring(0, 200)}...`, 'INFO');
    }
    
    // Validate
    const validationResult = validateData(jsonData, schema);
    
    if (logValidation) {
      if (validationResult.isValid) {
        log('✓ Validation PASSED - No errors found', 'INFO');
      } else {
        log(`✗ Validation FAILED - ${validationResult.errors.length} error(s) found`, 'ERROR');
        
        // Log each error
        validationResult.errors.forEach((error, index) => {
          logError(`Validation Error #${index + 1}:`, {
            field: error.field,
            value: error.value,
            rule: error.rule,
            message: error.message
          });
        });
      }
      
      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => {
          log(`⚠ Warning: ${warning}`, 'WARN');
        });
      }
    }
    
    return validationResult;
    
  } catch (error: any) {
    logError('Validation and conversion failed', error);
    return {
      isValid: false,
      errors: [{
        field: 'input',
        value: input.substring(0, 100),
        rule: 'conversion',
        message: `Conversion failed: ${error.message}`,
        timestamp: new Date().toISOString()
      }],
      warnings: [],
      convertedData: null
    };
  }
}

/**
 * Export validation errors to structured format
 */
export function exportValidationErrors(errors: ValidationError[]): string {
  const report = {
    timestamp: new Date().toISOString(),
    totalErrors: errors.length,
    errors: errors.map(err => ({
      field: err.field,
      value: err.value,
      rule: err.rule,
      message: err.message,
      timestamp: err.timestamp
    }))
  };
  
  return JSON.stringify(report, null, 2);
}

/**
 * Get validation summary
 */
export function getValidationSummary(result: ValidationResult): string {
  const summary = [
    '═══════════════════════════════════════════',
    '        VALIDATION SUMMARY',
    '═══════════════════════════════════════════',
    `Status: ${result.isValid ? '✓ PASSED' : '✗ FAILED'}`,
    `Total Errors: ${result.errors.length}`,
    `Total Warnings: ${result.warnings.length}`,
    ''
  ];
  
  if (result.errors.length > 0) {
    summary.push('ERRORS:');
    result.errors.forEach((error, index) => {
      summary.push(`  ${index + 1}. [${error.field}] ${error.message}`);
      summary.push(`     Value: ${JSON.stringify(error.value)}`);
      summary.push(`     Rule: ${error.rule}`);
    });
    summary.push('');
  }
  
  if (result.warnings.length > 0) {
    summary.push('WARNINGS:');
    result.warnings.forEach((warning, index) => {
      summary.push(`  ${index + 1}. ${warning}`);
    });
  }
  
  summary.push('═══════════════════════════════════════════');
  
  return summary.join('\n');
}
