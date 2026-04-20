# Validation System - Quick Start Guide

## ✅ Implementation Complete!

The validation system has been successfully integrated into your Playwright API BDD framework.

## What's Been Added

### 1. **Core Files**
- `src/utils/validationSchema.ts` - Validation rules and schemas
- `src/utils/validator.ts` - XML/JSON conversion and validation logic
- `src/utils/validationTest.ts` - Test suite for validation
- `VALIDATION.md` - Complete documentation

### 2. **Enhanced Files**
- `src/utils/httpHelper.ts` - Now validates requests before sending
- `src/utils/logger.ts` - Enhanced with validation error logging
 - `src/utils/oauthTokenHelper.ts` - OAuth client-credentials token support
 - `src/utils/encryptionHelper.ts` - AES-256-GCM encryption/decryption utilities
 - `src/utils/bearerTokenHelper.ts` - SessionStorage Bearer token extraction helper

### 3. **Dependencies**
- `xml2js` - XML to JSON conversion
- `@types/xml2js` - TypeScript definitions

## 🔐 OAuth Tokens (Client Credentials)

If `BEARER_TOKEN` is not provided, requests can use OAuth client credentials.

**Environment variables:**
- `OAUTH_TOKEN_URL`
- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_SCOPE` (optional)
- `OAUTH_AUDIENCE` (optional)
- `OAUTH_GRANT_TYPE` (optional, default: `client_credentials`)
- `OAUTH_EXTRA_PARAMS` (optional JSON or querystring)

Example:
```
OAUTH_TOKEN_URL=https://auth.example.com/oauth/token
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_SCOPE=api.read api.write
```

## 🔒 Encryption/Decryption Demo

Encryption is supported for request bodies and optional response decryption.

**Environment variables:**
- `ENCRYPTION_KEY` (32 bytes, base64 by default)
- `ENCRYPTION_KEY_ENCODING` (default: `base64`)
- `ENCRYPTION_ALGORITHM` (default: `aes-256-gcm`)
- `ENCRYPTION_ENABLED` (optional)

**Header overrides (per scenario):**
- `X-Encrypt-Body: true`
- `X-Decrypt-Response: true`

## 🚀 How It Works

### Automatic Validation (Already Active!)

Every XML or JSON request is now automatically:
1. ✅ Converted to standard JSON format
2. ✅ Validated against schema rules
3. ✅ Logged with detailed error information
4. ✅ Blocked if validation fails (with error report)

### Example Flow

```gherkin
When I send a "POST" request to "/api/store" with request body from "fixtures/producer-request-body.xml"
```

**Behind the scenes:**
```
→ Reading XML file
→ Converting XML to JSON
→ Validating fields:
  ✓ Entity.ID: Valid (numeric string)
  ✓ Entity.Name: Valid (1-256 chars)
  ✗ Latitude: Invalid (exceeds max range of 90)
  ✗ ZIP Code: Invalid (wrong format)
→ VALIDATION FAILED - 2 errors
→ Errors saved to: test-reports/validation-errors-1234567890.json
→ Request NOT sent (validation failed)
```

## 📋 Validation Rules

### Pre-configured Validations

**For STIBO Store Data (XML):**
- Entity ID (required, numeric)
- Entity Name (required, 1-256 chars)
- Latitude (-90 to 90)
- Longitude (-180 to 180)
- ZIP Code (format: 12345 or 12345-6789)
- Store Name (1-100 chars)
- Store ID (numeric)
- Dates (valid date format)
- Store Capacity (positive number)

**For Generic JSON Data:**
- ID (required)
- Name (required, 1-256 chars)
- Email (valid format)
- Phone (valid format)
- Status (active/inactive/pending)

## 🔍 Where to Find Validation Results

### 1. Console Output (Real-time)
```
[2026-01-24T10:30:45.123Z] [INFO] Validating XML request body...
[2026-01-24T10:30:45.234Z] [ERROR] ✗ Validation FAILED - 2 error(s) found
[2026-01-24T10:30:45.235Z] [ERROR] Validation Error #1:
[2026-01-24T10:30:45.236Z] [ERROR]   Field: Entity.Name
[2026-01-24T10:30:45.237Z] [ERROR]   Value: ""
[2026-01-24T10:30:45.238Z] [ERROR]   Rule: required
[2026-01-24T10:30:45.239Z] [ERROR]   Message: Name must be 1-256 characters
```

### 2. Log File
**Location:** `test-reports/execution.log`

Contains complete test execution logs including all validation results.

### 3. Error Report Files
**Location:** `test-reports/validation-errors-{timestamp}.json`

Example:
```json
{
  "timestamp": "2026-01-24T10:30:45.123Z",
  "totalErrors": 2,
  "errors": [
    {
      "field": "Entity.Name",
      "value": "",
      "rule": "required",
      "message": "Name must be 1-256 characters",
      "timestamp": "2026-01-24T10:30:45.123Z"
    },
    {
      "field": "Value.TEMP_P_LATITUDE",
      "value": "-95",
      "rule": "max",
      "message": "Latitude must be between -90 and 90",
      "timestamp": "2026-01-24T10:30:45.124Z"
    }
  ]
}
```

### 4. Cucumber HTML Report
**Location:** `test-reports/cucumber-report.html`

Validation summaries are attached to each test scenario.

## 🎯 Quick Examples

### Example 1: Valid Request (Passes Validation)
```xml
<?xml version="1.0" encoding="utf-8"?>
<STEP-ProductInformation>
  <Entities>
    <Entity ID="123456" UserTypeID="STORE" ParentID="ZALES">
      <Name>Test Store</Name>
      <Values>
        <Value AttributeID="TEMP_P_LATITUDE">26.13665509</Value>
        <Value AttributeID="TEMP_P_LONGITUDE">-80.11311417</Value>
        <Value AttributeID="TEMP_P_ZIPCODE">33304</Value>
      </Values>
    </Entity>
  </Entities>
</STEP-ProductInformation>
```

**Result:** ✅ Validation passes → Request sent

### Example 2: Invalid Request (Fails Validation)
```xml
<?xml version="1.0" encoding="utf-8"?>
<STEP-ProductInformation>
  <Entities>
    <Entity ID="ABC" UserTypeID="STORE">
      <Name></Name>
      <Values>
        <Value AttributeID="TEMP_P_LATITUDE">-95</Value>
        <Value AttributeID="TEMP_P_ZIPCODE">INVALID</Value>
      </Values>
    </Entity>
  </Entities>
</STEP-ProductInformation>
```

**Result:** ❌ Validation fails with errors:
1. Entity.ID must be numeric
2. Entity.Name is required
3. Latitude exceeds valid range
4. ZIP code format invalid

→ Request NOT sent

## 🛠️ Customization

### Add New Validation Rules

Edit `src/utils/validationSchema.ts`:

```typescript
export const stiboStoreSchema: ValidationSchema = {
  // ... existing rules ...
  
  // Add your custom rule
  'Value.YOUR_FIELD': {
    field: 'Value.YOUR_FIELD',
    type: 'string',
    required: true,
    minLength: 5,
    maxLength: 50,
    pattern: /^[A-Z0-9]+$/,
    errorMessage: 'Your field must be 5-50 uppercase alphanumeric characters'
  }
};
```

### Modify Existing Rules

```typescript
// Change Entity.Name max length from 256 to 100
'Entity.Name': {
  field: 'Entity.Name',
  type: 'string',
  required: true,
  minLength: 1,
  maxLength: 100,  // Changed from 256
  errorMessage: 'Name must be 1-100 characters'
}
```

## 📊 Testing the Validation System

### Run Your Existing Tests
```bash
npm test
```
All your existing tests will now include automatic validation!

### Run Validation Test Suite (Optional)
```bash
npx tsx src/utils/validationTest.ts
```
This runs comprehensive validation tests to verify the system is working correctly.

## 🐛 Troubleshooting

### Issue: Too Many Validation Errors
**Solution:** Review your validation schema and adjust rules to match your actual data requirements.

### Issue: Valid Data Failing Validation
**Solution:** Check the field paths in the schema match your XML/JSON structure. Use dot notation (e.g., `Entity.Name`).

### Issue: Want to Skip Validation Temporarily
**Solution:** Edit `src/utils/httpHelper.ts` and comment out the validation check (not recommended for production).

## 📚 More Information

For complete documentation, see: [VALIDATION.md](VALIDATION.md)

## ✨ Benefits

- ✅ **Catch errors early** - Before making API calls
- ✅ **Better logging** - Detailed error reports
- ✅ **Data quality** - Enforce standards
- ✅ **Time saving** - No need to debug bad API responses
- ✅ **Documentation** - Schema serves as field documentation

## 🎉 You're All Set!

The validation system is now active and ready to use. Just run your tests as normal:

```bash
npm test
```

All requests will be automatically validated! 🚀
