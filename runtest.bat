@echo off
REM Runs the default Cucumber test suite using the config and reports.
REM This batch file runs Cucumber tests and automatically opens the report

REM Run cucumber with all arguments passed to it
node --loader ts-node/esm ./node_modules/@cucumber/cucumber/bin/cucumber-js %*

REM Generate Excel report from cucumber report
echo Generating Excel report...
node generate-excel-report.js

REM If tests passed, open the report
if %ERRORLEVEL% LEQ 1 (
    start "" test-reports\cucumber-report.html
)
