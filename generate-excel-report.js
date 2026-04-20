/**
 * Generates an Excel report from the latest cucumber-report.json.
 * Writes a timestamped .xlsx file to test-reports.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateExcelReport() {
  try {
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Test Report');

    // Add headers with new format
    worksheet.columns = [
      { header: 'Test Case ID', key: 'testCaseId', width: 15 },
      { header: 'Module/Feature', key: 'feature', width: 30 },
      { header: 'Scenario Name', key: 'scenario', width: 45 },
      { header: 'Steps', key: 'steps', width: 50 },
      { header: 'Expected Result', key: 'expectedResult', width: 35 },
      { header: 'Actual Result', key: 'actualResult', width: 35 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Comments/Error Message', key: 'error', width: 60 },
      { header: 'Execution Date/Time', key: 'executionTime', width: 20 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Read all JSON report files
    const reportDir = path.join(__dirname, 'test-reports');
    const jsonFiles = fs.readdirSync(reportDir).filter(file => 
      file.endsWith('-report.json') && !file.includes('producer-validation-report')
    );

    // Use cucumber-report.json as primary source
    const cucumberReportPath = path.join(reportDir, 'cucumber-report.json');
    
    if (!fs.existsSync(cucumberReportPath)) {
      console.error('cucumber-report.json not found');
      return;
    }

    const reportData = JSON.parse(fs.readFileSync(cucumberReportPath, 'utf-8'));

    // Get execution timestamp
    const reportStats = fs.statSync(cucumberReportPath);
    const executionDate = new Date(reportStats.mtime);
    const executionDateTime = executionDate.toLocaleString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });

    // Extract scenario data
    let testCaseCounter = 1;
    
    reportData.forEach(feature => {
      const featureName = feature.name;
      
      if (feature.elements) {
        feature.elements.forEach(element => {
          const scenarioName = element.name;
          let status = 'PASSED';
          let errorMessage = '';
          let actualResult = 'Test executed successfully';
          let expectedResult = 'All steps should pass';
          let stepsText = '';

          // Check all steps for failures and build steps list
          if (element.steps) {
            const totalSteps = element.steps.length;
            let passedSteps = 0;
            let failedSteps = 0;
            const stepsList = [];
            
            element.steps.forEach((step, index) => {
              const stepStatus = step.result?.status || 'unknown';
              const stepKeyword = step.keyword || '';
              const stepName = step.name || '';
              const stepText = `${stepKeyword}${stepName}`.trim();
              
              // Build step with status indicator
              let stepIndicator = '';
              if (stepStatus === 'passed') {
                passedSteps++;
                stepIndicator = '✓';
              } else if (stepStatus === 'failed') {
                status = 'FAILED';
                failedSteps++;
                stepIndicator = '✗';
                if (step.result.error_message) {
                  errorMessage = step.result.error_message;
                }
              } else if (stepStatus === 'skipped') {
                if (status !== 'FAILED') {
                  status = 'SKIPPED';
                }
                stepIndicator = '○';
              }
              
              stepsList.push(`${index + 1}. ${stepIndicator} ${stepText}`);
            });

            stepsText = stepsList.join('\n');

            if (status === 'PASSED') {
              actualResult = `All ${totalSteps} steps passed`;
            } else if (status === 'FAILED') {
              actualResult = `${failedSteps} of ${totalSteps} steps failed`;
            } else if (status === 'SKIPPED') {
              actualResult = `Test skipped - ${passedSteps} steps passed before skip`;
            }
          }

          // Generate Test Case ID
          const testCaseId = `TC_${String(testCaseCounter).padStart(4, '0')}`;
          testCaseCounter++;

          // Add row to worksheet
          const row = worksheet.addRow({
            testCaseId: testCaseId,
            feature: featureName,
            scenario: scenarioName,
            steps: stepsText || 'No steps defined',
            expectedResult: expectedResult,
            actualResult: actualResult,
            status: status,
            error: errorMessage || 'None',
            executionTime: executionDateTime
          });

          // Color code status
          const statusCell = row.getCell('status');
          if (status === 'PASSED') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
            statusCell.font = { color: { argb: 'FF000000' }, bold: true };
          } else if (status === 'FAILED') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
            statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
          } else if (status === 'SKIPPED') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } };
            statusCell.font = { color: { argb: 'FF000000' }, bold: true };
          }

          // Style cells
          statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('steps').alignment = { wrapText: true, vertical: 'top' };
          row.getCell('expectedResult').alignment = { wrapText: true, vertical: 'top' };
          row.getCell('actualResult').alignment = { wrapText: true, vertical: 'top' };
          row.getCell('testCaseId').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('executionTime').alignment = { vertical: 'middle', horizontal: 'center' };
          
          // Calculate row height based on content
          const stepCount = element.steps?.length || 0;
          const minHeight = Math.max(25, stepCount * 15, errorMessage ? 50 : 25);
          row.height = minHeight
          row.height = errorMessage ? 50 : 25;
        });
      }
    });

    // Save the workbook with timestamp
    const timestamp = Date.now();
    const outputPath = path.join(reportDir, `test-report-${timestamp}.xlsx`);
    await workbook.xlsx.writeFile(outputPath);
    
    console.log(`✓ Excel report generated successfully: ${outputPath}`);
  } catch (error) {
    console.error('Error generating Excel report:', error);
    process.exit(1);
  }
}

generateExcelReport();
