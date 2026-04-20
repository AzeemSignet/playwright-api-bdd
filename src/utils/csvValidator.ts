/**
 * CSV validator for attribute export files with type and rule checks.
 */
import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

// Define types as const objects for better ts-node compatibility
export interface AttributeRecord {
  ElementType: string;
  AttributeID: string;
  ID: string;
  Changed: string;
  Derived: string;
  Value: string;
  EntityID: string;
  UserTypeID: string;
  ParentID: string;
  EntityName: string;
  ExportTime: string;
  ExportContext: string;
  ContextID: string;
  WorkspaceID: string;
  UseContextLocale: string;
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'uuid' | 'email' | 'url';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: string[];
}

export class CSVValidator {
  /**
   * Parse CSV file and return records
   */
  static parseCSV(filePath: string): AttributeRecord[] {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`CSV file not found: ${absolutePath}`);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 1) {
      return [];
    }

    // Parse CSV manually
    const headers = lines[0]!.split(',').map(h => h.trim());
    const records: AttributeRecord[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]!.split(',').map(v => v.trim());
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record as AttributeRecord);
    }

    return records as AttributeRecord[];
  }

  /**
   * Validate a single record against rules
   */
  static validateRecord(record: AttributeRecord, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = (record as any)[rule.field];

      // Check if field is required
      if (rule.required && (!value || value.trim() === '')) {
        errors.push(`Field '${rule.field}' is required but is empty`);
        continue;
      }

      // Skip validation if value is empty and not required
      if (!value || value.trim() === '') {
        continue;
      }

      // Type-specific validation
      switch (rule.type) {
        case 'string':
          errors.push(...this.validateString(rule.field, value, rule));
          break;
        case 'number':
          errors.push(...this.validateNumber(rule.field, value, rule));
          break;
        case 'date':
          errors.push(...this.validateDate(rule.field, value, rule));
          break;
        case 'boolean':
          errors.push(...this.validateBoolean(rule.field, value, rule));
          break;
        case 'uuid':
          errors.push(...this.validateUUID(rule.field, value, rule));
          break;
        case 'email':
          errors.push(...this.validateEmail(rule.field, value, rule));
          break;
        case 'url':
          errors.push(...this.validateURL(rule.field, value, rule));
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate all records against rules
   */
  static validateAllRecords(records: AttributeRecord[], rules: ValidationRule[]): { 
    totalRecords: number; 
    validRecords: number; 
    invalidRecords: Array<{ index: number; errors: string[] }> 
  } {
    const invalidRecords: Array<{ index: number; errors: string[] }> = [];
    let validCount = 0;

    records.forEach((record, index) => {
      const validation = this.validateRecord(record, rules);
      if (validation.valid) {
        validCount++;
      } else {
        invalidRecords.push({ index, errors: validation.errors });
      }
    });

    return {
      totalRecords: records.length,
      validRecords: validCount,
      invalidRecords
    };
  }

  // Private validation methods
  private static validateString(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];

    if (rule.minLength && value.length < rule.minLength) {
      errors.push(`Field '${field}': Length ${value.length} is less than minimum ${rule.minLength}`);
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push(`Field '${field}': Length ${value.length} exceeds maximum ${rule.maxLength}`);
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`Field '${field}': Value '${value}' does not match pattern ${rule.pattern}`);
    }

    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
      errors.push(`Field '${field}': Value '${value}' is not in allowed values [${rule.allowedValues.join(', ')}]`);
    }

    return errors;
  }

  private static validateNumber(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];
    const num = Number(value);

    if (isNaN(num)) {
      errors.push(`Field '${field}': Value '${value}' is not a valid number`);
      return errors;
    }

    if (rule.minLength && num < rule.minLength) {
      errors.push(`Field '${field}': Value ${num} is less than minimum ${rule.minLength}`);
    }

    if (rule.maxLength && num > rule.maxLength) {
      errors.push(`Field '${field}': Value ${num} exceeds maximum ${rule.maxLength}`);
    }

    return errors;
  }

  private static validateDate(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];
    const date = new Date(value);

    if (isNaN(date.getTime())) {
      errors.push(`Field '${field}': Value '${value}' is not a valid date`);
    }

    return errors;
  }

  private static validateBoolean(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];
    const validBooleans = ['true', 'false', 'yes', 'no', 'y', 'n', '0', '1'];

    if (!validBooleans.includes(value.toLowerCase())) {
      errors.push(`Field '${field}': Value '${value}' is not a valid boolean`);
    }

    return errors;
  }

  private static validateUUID(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(value)) {
      errors.push(`Field '${field}': Value '${value}' is not a valid UUID`);
    }

    return errors;
  }

  private static validateEmail(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(value)) {
      errors.push(`Field '${field}': Value '${value}' is not a valid email`);
    }

    return errors;
  }

  private static validateURL(field: string, value: string, rule: ValidationRule): string[] {
    const errors: string[] = [];

    try {
      new URL(value);
    } catch {
      errors.push(`Field '${field}': Value '${value}' is not a valid URL`);
    }

    return errors;
  }
}
