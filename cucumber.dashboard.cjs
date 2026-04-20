/**
 * Cucumber configuration used by the dashboard runner.
 * Excludes feature paths so the dashboard can pass them dynamically.
 */
module.exports = {
  default: {
    require: ['src/step-definitions/**/*.ts', 'src/support/**/*.ts'],
    format: [
      'progress',
      'html:test-reports/cucumber-report.html',
      'json:test-reports/cucumber-report.json'
    ],
    publishQuiet: true
  }
};
