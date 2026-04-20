/**
 * Default Cucumber configuration for CLI runs.
 * Includes feature paths, step definitions, and HTML/JSON reporting.
 */
module.exports = {
  default: {
    paths: ['src/features/**/*.feature'],
    require: ['src/step-definitions/**/*.ts', 'src/support/**/*.ts'],
    format: [
      'progress',
      'html:test-reports/cucumber-report.html',
      'json:test-reports/cucumber-report.json'
    ],
    publishQuiet: true
  }
};