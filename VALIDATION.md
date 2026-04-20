# Request Body Validation System

## Overview

This validation system automatically converts any input format (XML/JSON) to standard JSON and performs comprehensive field validations with detailed error logging.

## Features

✅ **Format Auto-Detection**: Automatically detects and converts XML or JSON input
✅ **Field Validation**: Validates data types, required fields, patterns, ranges, and custom rules
✅ **Error Logging**: Logs all validation errors with timestamps and details
✅ **Error Export**: Saves validation errors to JSON files for review
✅ **Schema-Based**: Easy to customize validation rules through schemas

## Architecture

### Components

1. **validationSchema.ts** - Define validation rules and field constraints
2. **validator.ts** - Core validation logic and XML/JSON conversion
3. **httpHelper.ts** - Integration with API request flow
4. **logger.ts** - Enhanced logging for validation errors

## Usage

### 1. Automatic Validation (Already Integrated)

Validation happens automatically when you send requests:

```typescript
// In your step definitions - no changes needed!
When('I send a "POST" request to "/api/endpoint" with request body from "fixtures/producer-request-body.xml"')
```

The system will:
1. Read the XML file
2. Convert it to JSON
3. Validate all fields
4. Log validation results
5. Save errors to file (if any)
6. Proceed with request (only if validation passes)

### 2. Manual Validation

You can also validate data programmatically:

```typescript
import { validateAndConvert } from './utils/validator.js';
import { getValidationSchema } from './utils/validationSchema.js';

// Validate XML
const xmlData = '<Entity><Name>Test</Name></Entity>';
const schema = getValidationSchema('stibo');
const result = await validateAndConvert(xmlData, schema, true);

if (!result.isValid) {
  console.log('Validation failed:', result.errors);
}
```

### 3. Custom Validation Schema

Create custom validation rules:

```typescript
import { ValidationSchema } from './utils/validationSchema.js';

const mySchema: ValidationSchema = {
  'username': {
    field: 'username',
    type: 'string',
    required: true,
    minLength: 3,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_]+$/,
    errorMessage: 'Username must be 3-50 alphanumeric characters'
  },
  'age': {
    field: 'age',
    type: 'number',
    required: true,
    min: 18,
    max: 120,
    errorMessage: 'Age must be between 18 and 120'
  },
  'email': {
    field: 'email',
    type: 'email',
    required: true,
    errorMessage: 'Valid email is required'
  }
};
```

## Validation Rules

### Supported Data Types

- `string` - Text values
- `number` - Numeric values (integers or decimals)
- `boolean` - true/false values
- `date` - Date values
- `email` - Email addresses
- `url` - Web URLs
- `array` - Array/list values
- `object` - Object/nested structures

### Validation Constraints

| Constraint | Applies To | Description |
|------------|-----------|-------------|
| `required` | All | Field must be present and non-empty |
| `minLength` | string | Minimum string length |
| `maxLength` | string | Maximum string length |
| `min` | number | Minimum numeric value |
| `max` | number | Maximum numeric value |
| `pattern` | string | RegExp pattern to match |
| `enum` | string | Must be one of specified values |
| `custom` | All | Custom validation function |

### Example Rules

```typescript
{
  // Required string with length constraints
  'storeName': {
    field: 'storeName',
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100
  },
  
  // Numeric range validation
  'latitude': {
    field: 'latitude',
    type: 'number',
    min: -90,
    max: 90
  },
  
  // Pattern validation (ZIP code)
  'zipCode': {
    field: 'zipCode',
    type: 'string',
    pattern: /^\d{5}(-\d{4})?$/
  },
  
  // Enum validation
  'status': {
    field: 'status',
    type: 'string',
    enum: ['active', 'inactive', 'pending']
  },
  
  // Custom validation
  'customField': {
    field: 'customField',
    type: 'string',
    custom: (value) => value.startsWith('PREFIX_')
  }
}
```

## Error Handling

### Error Object Structure

```typescript
{
  field: string;        // Field name that failed
  value: any;          // The actual value that failed
  rule: string;        // Validation rule that failed
  message: string;     // Human-readable error message
  timestamp: string;   // ISO timestamp of validation
}
```

### Error Logging

Validation errors are logged in multiple places:

1. **Console Output** - Real-time feedback during execution
2. **Log File** - `test-reports/execution.log`
3. **Error File** - `test-reports/validation-errors-{timestamp}.json`
4. **Cucumber Report** - Attached to test results

### Sample Error Log

```
[2026-01-24T10:30:45.123Z] [INFO] Validating XML request body...
[2026-01-24T10:30:45.234Z] [ERROR] ✗ Validation FAILED - 3 error(s) found
[2026-01-24T10:30:45.235Z] [ERROR] Validation Error #1:
[2026-01-24T10:30:45.236Z] [ERROR]   Field: Entity.Name
[2026-01-24T10:30:45.237Z] [ERROR]   Value: ""
[2026-01-24T10:30:45.238Z] [ERROR]   Rule: required
[2026-01-24T10:30:45.239Z] [ERROR]   Message: Name must be 1-256 characters
```

## Pre-defined Schemas

### STIBO Store Schema

Validates STIBO store entity data with fields:
- Entity ID (required, numeric string)
- UserTypeID (required)
- Name (required, 1-256 chars)
- Longitude (-180 to 180)
- Latitude (-90 to 90)
- ZIP Code (format: 12345 or 12345-6789)
- Store Name (1-100 chars)
- And more...

### Generic Schema

Validates common fields:
- id (required)
- name (required, 1-256 chars)
- email (valid email format)
- phone (valid phone format)
- status (active/inactive/pending)

## Conversion Features

### XML to JSON Conversion

```xml
<?xml version="1.0" encoding="utf-8"?>
<Entity ID="123" UserTypeID="STORE">
  <Name>Store Name</Name>
  <Values>
    <Value AttributeID="LATITUDE">26.13665509</Value>
  </Values>
</Entity>
```

Converts to:

```json
{
  "Entity": {
    "ID": "123",
    "UserTypeID": "STORE",
    "Name": "Store Name",
    "Values": {
      "Value": {
        "AttributeID": "LATITUDE",
        "_": "26.13665509"
      }
    }
  }
}
```

### JSON Validation

Direct JSON input is also supported:

```json
{
  "id": "123",
  "name": "Test Store",
  "email": "store@example.com"
}
```

## Testing

### Run Tests with Validation

```bash
npm test
```

All requests will be automatically validated before being sent.

### View Validation Results

1. **Console** - See real-time validation results
2. **Log File** - Check `test-reports/execution.log`
3. **Error Files** - Review `test-reports/validation-errors-*.json`
4. **Cucumber Report** - Open `test-reports/cucumber-report.html`

## Best Practices

### 1. Define Strict Schemas

```typescript
// Good - Specific constraints
{
  field: 'email',
  type: 'email',
  required: true,
  pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
}

// Bad - Too permissive
{
  field: 'email',
  type: 'string'
}
```

### 2. Provide Clear Error Messages

```typescript
{
  field: 'age',
  type: 'number',
  min: 18,
  max: 120,
  errorMessage: 'Age must be between 18 and 120 years' // Clear and helpful
}
```

### 3. Use Custom Validators for Complex Logic

```typescript
{
  field: 'password',
  type: 'string',
  custom: (value) => {
    // Must contain uppercase, lowercase, number, and special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(value);
  },
  errorMessage: 'Password must be 8+ chars with uppercase, lowercase, number, and special character'
}
```

### 4. Review Validation Errors Regularly

Check error files to identify common validation issues and improve data quality.

## Troubleshooting

### Issue: Validation always fails

**Solution**: Check that your schema field paths match your data structure. Use dot notation for nested fields.

```typescript
// For this data structure
{ "Entity": { "Name": "Test" } }

// Use this field path
field: 'Entity.Name'
```

### Issue: XML conversion fails

**Solution**: Ensure XML is well-formed and properly encoded. Check for:
- Proper opening/closing tags
- Valid UTF-8 encoding
- No special characters that need escaping

### Issue: Custom validation not working

**Solution**: Ensure custom function returns boolean:

```typescript
// Correct
custom: (value) => value.startsWith('PREFIX_')

// Incorrect
custom: (value) => { value.startsWith('PREFIX_') } // Missing return
```

## Advanced Usage

### Skip Validation for Specific Requests

To skip validation temporarily (not recommended for production):

```typescript
// In httpHelper.ts
// Comment out or conditionally call validation
// const validationResult = await validateAndConvert(bodyText, schema, true);
```

### Add Custom Validation Rules Dynamically

```typescript
import { addValidationRule } from './utils/validationSchema.js';

const schema = getValidationSchema('stibo');
addValidationRule(schema, {
  field: 'customField',
  type: 'string',
  required: true,
  pattern: /^CUSTOM_\d+$/,
  errorMessage: 'Custom field must start with CUSTOM_ followed by numbers'
});
```

### Merge Multiple Schemas

```typescript
import { mergeSchemas } from './utils/validationSchema.js';

const combinedSchema = mergeSchemas(
  stiboStoreSchema,
  myCustomSchema,
  additionalRules
);
```

## API Reference

See individual files for detailed API documentation:
- [validationSchema.ts](src/utils/validationSchema.ts) - Schema definitions
- [validator.ts](src/utils/validator.ts) - Validation functions
- [logger.ts](src/utils/logger.ts) - Logging utilities

## Support

For issues or questions:
1. Check validation error logs in `test-reports/`
2. Review this documentation
3. Examine the validation schema for your data type
4. Check the console output for detailed error messages
