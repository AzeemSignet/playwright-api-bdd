# Request Validation Flow Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Test Execution Flow                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Cucumber Test   │
│   (Feature File) │
└────────┬─────────┘
         │
         │ When I send "POST" request with body from "fixture.xml"
         ▼
┌────────────────────────────────┐
│    stiboapisteps.ts            │
│  (Step Definitions)            │
└────────┬───────────────────────┘
         │
         │ Calls sendXMLRequest()
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      httpHelper.ts                                   │
│                    (Request Handler)                                 │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  1. Read XML/JSON file                                      │    │
│  └──────────────────┬─────────────────────────────────────────┘    │
│                     │                                                │
│  ┌──────────────────▼─────────────────────────────────────────┐    │
│  │  2. Validate Input                                          │    │
│  │     → Call validateAndConvert()                             │    │
│  │     → Convert XML to JSON                                   │    │
│  │     → Validate against schema                               │    │
│  └──────────────────┬─────────────────────────────────────────┘    │
│                     │                                                │
│                     ├──────────── Valid? ───────────────┐           │
│                     │                                    │           │
│                 ✓ YES                                ✗ NO           │
│                     │                                    │           │
│  ┌──────────────────▼─────────────────┐   ┌────────────▼────────┐ │
│  │  3a. Log Success                   │   │  3b. Log Errors     │ │
│  │      "✓ Validation passed"         │   │      "✗ Validation  │ │
│  └──────────────────┬─────────────────┘   │       failed"       │ │
│                     │                      └────────────┬────────┘ │
│  ┌──────────────────▼─────────────────┐   ┌────────────▼────────┐ │
│  │  4a. Send API Request              │   │  4b. Save Error File│ │
│  │      → POST to endpoint            │   │      → validation-  │ │
│  │      → With validated body         │   │        errors.json  │ │
│  └──────────────────┬─────────────────┘   └────────────┬────────┘ │
│                     │                                    │           │
│  ┌──────────────────▼─────────────────┐   ┌────────────▼────────┐ │
│  │  5a. Return Response               │   │  5b. Throw Error    │ │
│  │      → Status, Headers, Body       │   │      → Stop test    │ │
│  └────────────────────────────────────┘   └─────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Response/Error
         ▼
┌────────────────────────────────┐
│    stiboapisteps.ts            │
│  (Assertion Steps)             │
│  Then response status "2xx"    │
└────────────────────────────────┘
```

---

## Request Preprocessing Cache (Performance Optimization)

To reduce repeated CPU and disk work when the same request body is used across
many scenarios, the Stibo request helper applies an in-memory cache for three
preprocessing steps:

1) Fixture file reads (disk I/O)
2) XML/JSON conversion to a JSON object
3) Validation and schema checks

Important behavior and safety guarantees:

- The cache is content-addressed. The key includes the exact request body
    (string), so a different body always results in a cache miss and a fresh
    conversion/validation. The new body is cached after the first use.
- If the same fixture file is used with different data (content changes), the
    full body string differs, so it is treated as a new cache key.
- HTTP responses are never cached. Each step still makes a real network call
    to the target API, so results remain accurate for stateful or time-sensitive
    endpoints.

Optional cache reset boundary (per feature file):

- When CLEAR_CACHE_PER_FEATURE is set (any non-empty value), caches are cleared
    automatically when the next scenario comes from a different feature file.
- This keeps fast reuse inside a single feature file while preventing cross-
    feature reuse of preprocessing results.

---

## Validation Process Detail

```
┌─────────────────────────────────────────────────────────────────────┐
│                       validator.ts                                   │
│                    (Validation Engine)                               │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Input: XML String or JSON String                          │    │
│  └──────────────────┬─────────────────────────────────────────┘    │
│                     │                                                │
│  ┌──────────────────▼─────────────────────────────────────────┐    │
│  │  Step 1: Format Detection                                   │    │
│  │  → detectFormat(input)                                      │    │
│  │  → Returns: 'xml' | 'json' | 'unknown'                     │    │
│  └──────────────────┬─────────────────────────────────────────┘    │
│                     │                                                │
│                     ├─── XML ────┐                                  │
│                     │             │                                  │
│  ┌──────────────────▼─────────┐  │  ┌────────────────────────────┐ │
│  │  Step 2a: Parse JSON       │  │  │  Step 2b: Convert XML      │ │
│  │  → JSON.parse()            │  └──▶  → xml2js.parseString()   │ │
│  │  → Return object           │     │  → Return JSON object      │ │
│  └──────────────────┬─────────┘     └────────────┬───────────────┘ │
│                     │                              │                 │
│                     └──────────┬───────────────────┘                 │
│                                │                                      │
│  ┌─────────────────────────────▼──────────────────────────────┐    │
│  │  Step 3: Load Validation Schema                            │    │
│  │  → getValidationSchema('stibo' | 'generic')                │    │
│  │  → Returns: Schema with rules for each field               │    │
│  └─────────────────────────────┬──────────────────────────────┘    │
│                                │                                      │
│  ┌─────────────────────────────▼──────────────────────────────┐    │
│  │  Step 4: Field-by-Field Validation                         │    │
│  │                                                             │    │
│  │  For each rule in schema:                                  │    │
│  │    ┌─────────────────────────────────────────────┐        │    │
│  │    │ a. Extract field value (dot notation)       │        │    │
│  │    │    e.g., 'Entity.Name' → data.Entity.Name   │        │    │
│  │    └─────────────────┬───────────────────────────┘        │    │
│  │                      │                                      │    │
│  │    ┌─────────────────▼───────────────────────────┐        │    │
│  │    │ b. Check if required                        │        │    │
│  │    │    → Is value present?                      │        │    │
│  │    └─────────────────┬───────────────────────────┘        │    │
│  │                      │                                      │    │
│  │    ┌─────────────────▼───────────────────────────┐        │    │
│  │    │ c. Validate data type                       │        │    │
│  │    │    → string, number, boolean, date, etc.    │        │    │
│  │    └─────────────────┬───────────────────────────┘        │    │
│  │                      │                                      │    │
│  │    ┌─────────────────▼───────────────────────────┐        │    │
│  │    │ d. Apply constraints                        │        │    │
│  │    │    → minLength, maxLength (strings)         │        │    │
│  │    │    → min, max (numbers)                     │        │    │
│  │    │    → pattern (regex)                        │        │    │
│  │    │    → enum (allowed values)                  │        │    │
│  │    │    → custom function                        │        │    │
│  │    └─────────────────┬───────────────────────────┘        │    │
│  │                      │                                      │    │
│  │                      ├──── Pass ────┐                      │    │
│  │                      │               │                      │    │
│  │        ┌─────────────▼──────┐  ┌────▼──────────────┐      │    │
│  │        │  Add to error list │  │  Continue to next  │      │    │
│  │        │  {field, value,    │  │  field             │      │    │
│  │        │   rule, message}   │  └────────────────────┘      │    │
│  │        └────────────────────┘                              │    │
│  │                                                             │    │
│  └─────────────────────────────┬──────────────────────────────┘    │
│                                │                                      │
│  ┌─────────────────────────────▼──────────────────────────────┐    │
│  │  Step 5: Generate Result                                   │    │
│  │  {                                                          │    │
│  │    isValid: boolean,        // true if no errors           │    │
│  │    errors: ValidationError[], // List of all errors        │    │
│  │    warnings: string[],      // List of warnings            │    │
│  │    convertedData: object    // The JSON object             │    │
│  │  }                                                          │    │
│  └─────────────────────────────┬──────────────────────────────┘    │
│                                │                                      │
│  ┌─────────────────────────────▼──────────────────────────────┐    │
│  │  Step 6: Log Results                                       │    │
│  │  → logger.log() - To console and file                      │    │
│  │  → getValidationSummary() - Formatted summary              │    │
│  │  → exportValidationErrors() - JSON error report            │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Schema Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                     validationSchema.ts                              │
│                    (Validation Rules)                                │
│                                                                       │
│  ValidationSchema = {                                                │
│                                                                       │
│    'field.path': {                                                   │
│      field: 'field.path',    // Dot notation for nested fields      │
│      type: 'string',          // Data type to validate              │
│      required: true,          // Is field mandatory?                │
│      minLength: 1,            // Min string length (optional)        │
│      maxLength: 256,          // Max string length (optional)        │
│      min: 0,                  // Min number value (optional)         │
│      max: 100,                // Max number value (optional)         │
│      pattern: /regex/,        // Regex pattern (optional)            │
│      enum: ['a', 'b'],        // Allowed values (optional)           │
│      custom: (val) => bool,   // Custom function (optional)          │
│      errorMessage: 'error'    // Custom error message                │
│    }                                                                  │
│  }                                                                    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │  Pre-configured Schemas:                                 │       │
│  │                                                           │       │
│  │  1. stiboStoreSchema                                     │       │
│  │     → For STIBO XML store entity data                    │       │
│  │     → Fields: Entity.ID, Entity.Name, Value.*            │       │
│  │                                                           │       │
│  │  2. genericSchema                                        │       │
│  │     → For general JSON data                              │       │
│  │     → Fields: id, name, email, phone, status             │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Logging Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         logger.ts                                    │
│                      (Logging System)                                │
│                                                                       │
│  Validation Log Entry                                                │
│       │                                                               │
│       ├────────────────┬────────────────┬────────────────┐          │
│       │                │                │                │          │
│       ▼                ▼                ▼                ▼          │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐     │
│  │ Console │   │   File   │   │  Error   │   │   Cucumber   │     │
│  │ Output  │   │  (log)   │   │   File   │   │   Report     │     │
│  └─────────┘   └──────────┘   └──────────┘   └──────────────┘     │
│       │             │               │                │               │
│       │             │               │                │               │
│       ▼             ▼               ▼                ▼               │
│  Real-time    execution.log  validation-    Attached to             │
│  feedback                     errors-       scenario                 │
│                               {time}.json                            │
│                                                                       │
│  Format:                                                             │
│  [timestamp] [LEVEL] message                                         │
│                                                                       │
│  Levels:                                                             │
│  • INFO  - General information                                       │
│  • WARN  - Warnings                                                  │
│  • ERROR - Validation failures                                       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Object Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ValidationError                                 │
│                                                                       │
│  {                                                                    │
│    field: "Entity.Name",              // Field that failed           │
│    value: "",                         // Actual value provided       │
│    rule: "required",                  // Rule that was violated      │
│    message: "Name is required",       // Human-readable message      │
│    timestamp: "2026-01-24T10:30:45"   // When error occurred         │
│  }                                                                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      ValidationResult                                │
│                                                                       │
│  {                                                                    │
│    isValid: false,                    // Overall validation status   │
│    errors: [                          // Array of all errors         │
│      { field, value, rule, message, timestamp },                     │
│      { field, value, rule, message, timestamp }                      │
│    ],                                                                 │
│    warnings: [                        // Array of warnings           │
│      "Field X is deprecated"                                         │
│    ],                                                                 │
│    convertedData: {                   // The JSON object             │
│      Entity: { Name: "..." }                                         │
│    }                                                                  │
│  }                                                                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Example

### Valid Request

```
XML File (fixtures/store.xml)
    │
    │ <Entity ID="123"><Name>Store</Name></Entity>
    ▼
convertToJson()
    │
    │ { "Entity": { "ID": "123", "Name": "Store" } }
    ▼
validateData(data, schema)
    │
    ├─▶ Check Entity.ID: ✓ Valid (numeric string)
    ├─▶ Check Entity.Name: ✓ Valid (1-256 chars)
    └─▶ All validations passed
    │
    ▼
{ isValid: true, errors: [], convertedData: {...} }
    │
    ▼
Send API Request
    │
    ▼
Response (200 OK)
```

### Invalid Request

```
XML File (fixtures/invalid.xml)
    │
    │ <Entity ID="ABC"><Name></Name></Entity>
    ▼
convertToJson()
    │
    │ { "Entity": { "ID": "ABC", "Name": "" } }
    ▼
validateData(data, schema)
    │
    ├─▶ Check Entity.ID: ✗ FAIL (not numeric)
    ├─▶ Check Entity.Name: ✗ FAIL (empty, required)
    └─▶ Validation failed with 2 errors
    │
    ▼
{ 
  isValid: false, 
  errors: [
    { field: "Entity.ID", rule: "pattern", ... },
    { field: "Entity.Name", rule: "required", ... }
  ]
}
    │
    ├─▶ Log errors to console
    ├─▶ Log errors to execution.log
    ├─▶ Save to validation-errors-{time}.json
    └─▶ Throw Error (request not sent)
    │
    ▼
Test Fails with Validation Error
```

---

## Component Interaction

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Cucumber    │─────▶│ Step Defs    │─────▶│ API Helper   │
│  Features    │      │              │      │              │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                    │
                                                    │ validates
                                                    ▼
                                            ┌──────────────┐
                                            │  Validator   │◀──┐
                                            │              │   │
                                            └──────┬───────┘   │
                                                   │           │
                                                   │ uses      │ uses
                                                   ▼           │
                                            ┌──────────────┐   │
                                            │   Schema     │───┘
                                            │              │
                                            └──────────────┘
                                                   │
                                                   │ logs to
                                                   ▼
                                            ┌──────────────┐
                                            │   Logger     │
                                            │              │
                                            └──────┬───────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                                    ▼              ▼              ▼
                              ┌──────────┐  ┌──────────┐  ┌──────────┐
                              │ Console  │  │ Log File │  │  Error   │
                              │          │  │          │  │  Files   │
                              └──────────┘  └──────────┘  └──────────┘
```

---

## File Relationships

```
playwright-api-bdd/
│
├── src/
│   ├── features/
│   │   ├── *.feature ────────────────┐
│   │   │                             │
│   │   └── fixtures/                 │ references
│   │       └── *.xml ─────────┐      │
│   │                          │      │
│   ├── step-definitions/      │      │
│   │   └── stiboapisteps.ts ◀─┴──────┘
│   │           │                     calls
│   │           ▼
│   └── utils/
│       ├── httpHelper.ts ◀───────────┐
│       │       │ uses                │
│       │       ├────────────────┐    │
│       │       │                │    │
│       │       ▼                ▼    │
│       ├── validator.ts ───▶ validationSchema.ts
│       │       │
│       │       ├───uses────▶ logger.ts
│       │       │                │
│       │       │                └───writes to───┐
│       │       │                                │
│       └── validationTest.ts (standalone)      │
│                                                 │
└── test-reports/                               │
    ├── execution.log ◀──────────────────────────┤
    ├── validation-errors-*.json ◀───────────────┘
    └── cucumber-report.html
```

---

## State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Validation State Machine                            │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   START      │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Read Input   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Detect Format│
                    └──────┬───────┘
                           │
                ┌──────────┴──────────┐
                │                     │
            XML │                     │ JSON
                ▼                     ▼
         ┌────────────┐        ┌────────────┐
         │ Parse XML  │        │ Parse JSON │
         └──────┬─────┘        └──────┬─────┘
                │                     │
                └──────────┬──────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Load Schema  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Validate     │
                    │ Fields       │
                    └──────┬───────┘
                           │
                ┌──────────┴──────────┐
                │                     │
            Valid                 Invalid
                │                     │
                ▼                     ▼
         ┌────────────┐        ┌────────────┐
         │ Log Success│        │ Log Errors │
         └──────┬─────┘        └──────┬─────┘
                │                     │
                ▼                     ▼
         ┌────────────┐        ┌────────────┐
         │Send Request│        │Save Errors │
         └──────┬─────┘        └──────┬─────┘
                │                     │
                ▼                     ▼
         ┌────────────┐        ┌────────────┐
         │  SUCCESS   │        │   FAILURE  │
         └────────────┘        └────────────┘
```

---

This diagram set provides a complete visual understanding of the validation system's architecture, data flow, and component interactions.
