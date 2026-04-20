# Execution Logging

## Overview
The project now includes comprehensive logging of all API test execution. All requests, responses, and test steps are automatically logged to a file for easy debugging and audit trails.

## Log File Location
```
test-reports/execution.log
```

## Log File Contents

The execution log captures:

1. **Test Execution Start**: Timestamp when tests begin
   ```
   [2026-01-23T05:04:37.723Z] Test Execution Started
   ```

2. **HTTP Requests**: Detailed request information
   ```
   [2026-01-23T05:04:37.746Z] [INFO] → Request: POST https://api.example.com/endpoint
   [2026-01-23T05:04:37.746Z] [INFO]   Headers: {"Content-Type":"application/xml","Authorization":"Bearer token"}
   [2026-01-23T05:04:37.747Z] [INFO]   Body: <?xml version="1.0"?>...
   ```

3. **HTTP Responses**: Response status, headers, and body
   ```
   [2026-01-23T05:04:39.190Z] [INFO] ← Response Status: 403
   [2026-01-23T05:04:39.191Z] [INFO]   Headers: {"content-type":"application/json",...}
   [2026-01-23T05:04:39.192Z] [INFO]   Body: {"message":"Forbidden"}
   ```

4. **Error Logs**: Any errors encountered during test execution
   ```
   [2026-01-23T05:04:45.123Z] [ERROR] ERROR: Step validation failed
   ```

## Features

- **Automatic Request/Response Logging**: Every API call is automatically logged
- **Truncation**: Large request/response bodies are truncated at 500 characters with `...[truncated]` indicator
- **Timestamps**: All logs include ISO 8601 timestamps for precise timing
- **Log Levels**: INFO and ERROR levels for easy filtering
- **Automatic Flushing**: Logs are automatically persisted to file
- **Log File Reset**: The log file is cleared at the start of each test run

## Viewing Logs

### While Tests Are Running
Open `test-reports/execution.log` in a text editor to view logs in real-time (may need to refresh).

### After Tests Complete
View the complete log file:
```bash
cat test-reports/execution.log
```

Or open it in any text editor:
- VS Code
- Notepad
- Sublime Text
- Any text editor

## Logger API (for developers)

The logger utility (`src/utils/logger.ts`) provides these functions:

```typescript
import { 
  initializeLogger,      // Initialize logging (called automatically)
  log,                   // Log a custom message
  logRequest,            // Log HTTP request
  logResponse,           // Log HTTP response
  logScenario,           // Log scenario name
  logStep,               // Log step execution
  logError,              // Log error message
  flushLogs,             // Manually flush logs to file
  getLogFilePath         // Get path to log file
} from '../utils/logger.js';

// Example usage:
await log('Custom message', 'INFO');
await logError('Something went wrong', error);
```

## Integration

The logger is automatically integrated into:
- **Step Definitions**: `src/step-definitions/stiboapisteps.ts`
- **API Helper**: `src/utils/httpHelper.ts` - Logs all requests and responses

## Notes

- Log files are created in `test-reports/` directory (automatically created if it doesn't exist)
- Each test run creates a fresh log file
- Large payloads are automatically truncated to keep logs readable
- All logs are also printed to the console in addition to being written to the file
