/**
 * Validation schemas and helpers for XML/JSON request validation.
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

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Default validation schema for STIBO Store Entity
 * This validates the basic structure after XML parsing
 * Note: Only validates top-level required fields to avoid false positives
 * The XML structure is: STEP-ProductInformation > Entities > Entity
 */
export const stiboStoreSchema: ValidationSchema = {
  // Validate that the main structure exists
  'STEP-ProductInformation': {
    field: 'STEP-ProductInformation',
    type: 'object',
    required: true,
    errorMessage: 'STEP-ProductInformation root element is required'
  },
  'STEP-ProductInformation.Entities': {
    field: 'STEP-ProductInformation.Entities',
    type: 'object',
    required: true,
    errorMessage: 'Entities element is required'
  },
  'STEP-ProductInformation.Entities.Entity': {
    field: 'STEP-ProductInformation.Entities.Entity',
    type: 'object',
    required: true,
    errorMessage: 'At least one Entity element is required'
  },
  // Entity attributes (merged by xml2js with mergeAttrs: true)
  'STEP-ProductInformation.Entities.Entity.ID': {
    field: 'STEP-ProductInformation.Entities.Entity.ID',
    type: 'string',
    required: true,
    pattern: /^\d+$/,
    errorMessage: 'Entity ID must be a numeric string'
  },
  'STEP-ProductInformation.Entities.Entity.UserTypeID': {
    field: 'STEP-ProductInformation.Entities.Entity.UserTypeID',
    type: 'string',
    required: true,
    errorMessage: 'UserTypeID is required'
  },
  'STEP-ProductInformation.Entities.Entity.Name': {
    field: 'STEP-ProductInformation.Entities.Entity.Name',
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 256,
    errorMessage: 'Entity Name must be 1-256 characters'
  }
};

/**
 * Generic validation schema for common data types
 */
export const genericSchema: ValidationSchema = {
  id: {
    field: 'id',
    type: 'string',
    required: true,
    errorMessage: 'ID is required'
  },
  name: {
    field: 'name',
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 256,
    errorMessage: 'Name must be 1-256 characters'
  },
  email: {
    field: 'email',
    type: 'email',
    required: false,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    errorMessage: 'Email must be valid'
  },
  phone: {
    field: 'phone',
    type: 'string',
    required: false,
    pattern: /^\+?[\d\s\-()]+$/,
    errorMessage: 'Phone number format is invalid'
  },
  status: {
    field: 'status',
    type: 'string',
    required: false,
    enum: ['active', 'inactive', 'pending'],
    errorMessage: 'Status must be one of: active, inactive, pending'
  }
};

/**
 * Get validation schema by type
 */
export function getValidationSchema(schemaType: 'stibo' | 'generic' = 'stibo'): ValidationSchema {
  return schemaType === 'stibo' ? stiboStoreSchema : genericSchema;
}

/**
 * Get extended STIBO schema with optional field validations
 * Use this if you want stricter validation of Value fields
 */
export function getExtendedStiboSchema(): ValidationSchema {
  return {
    ...stiboStoreSchema,
    // Additional optional validations for specific Value fields
    // These are not required but will be validated if present
    'STEP-ProductInformation.Entities.Entity.Values.Value': {
      field: 'STEP-ProductInformation.Entities.Entity.Values.Value',
      type: 'object',
      required: false,
      errorMessage: 'Values element should be an object or array'
    }
  };
}

/**
 * Add custom validation rule dynamically
 */
export function addValidationRule(schema: ValidationSchema, rule: ValidationRule): ValidationSchema {
  schema[rule.field] = rule;
  return schema;
}

/**
 * Merge validation schemas
 */
export function mergeSchemas(...schemas: ValidationSchema[]): ValidationSchema {
  return Object.assign({}, ...schemas);
}
