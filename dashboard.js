/**
 * Dashboard web server for running BDD tests and viewing summaries.
 * Serves the HTML UI, runs Cucumber with selected features, and exposes report/download endpoints.
 */
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3000;
const runState = {
  running: false,
  currentScenario: '',
  startedAt: 0,
  lastConfig: null
};

function stripInlineComment(line) {
  const hashIndex = line.indexOf('#');
  if (hashIndex === -1) return line;
  return line.slice(0, hashIndex).trimEnd();
}

function getTagTokens(line) {
  const cleaned = stripInlineComment(line).trim();
  if (!cleaned.startsWith('@')) return [];
  return cleaned.split(/\s+/).filter(token => token.startsWith('@'));
}

function getScenarioTags() {
  const featuresDir = path.join(__dirname, 'src', 'features');
  const tags = new Set();
  const ignoredTags = new Set(['@beforehook']);
  if (!fs.existsSync(featuresDir)) return [];

  const files = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.feature'))
    .map(entry => entry.name);

  files.forEach(fileName => {
    const content = fs.readFileSync(path.join(featuresDir, fileName), 'utf-8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      getTagTokens(trimmed).forEach(token => {
        if (!ignoredTags.has(token)) tags.add(token);
      });
    });
  });

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function getScenarioEntries() {
  const featuresDir = path.join(__dirname, 'src', 'features');
  if (!fs.existsSync(featuresDir)) return [];

  const files = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.feature'))
    .map(entry => entry.name);

  const entries = [];

  files.forEach(fileName => {
    const content = fs.readFileSync(path.join(featuresDir, fileName), 'utf-8');
    const featureKey = fileName.replace(/\.feature$/i, '');
    let pendingTags = [];
    let featureTags = [];
    let pendingComments = [];
    let outline = null;
    let activeScenario = null;
    let inExamples = false;
    let exampleHeaders = null;
    let lastTableTarget = null;

    function buildGoalHtml(data) {
      const parts = [];
      if (data.objective) {
        parts.push(data.objective);
      }

      if (data.documentationNotes.length > 0) {
        parts.push(data.documentationNotes.join(' '));
      }

      const normalizedParts = parts.map(part => ({
        raw: part,
        normalized: String(part)
          .toLowerCase()
          .replace(/[\s.]+/g, ' ')
          .trim()
      })).filter(item => item.normalized.length > 0);

      const unique = [];
      const seen = new Set();
      normalizedParts.forEach(item => {
        if (seen.has(item.normalized)) return;
        seen.add(item.normalized);
        unique.push(item);
      });

      const deduped = unique.filter(item => {
        return !unique.some(other => other !== item && other.normalized.includes(item.normalized));
      }).map(item => item.raw);

      if (deduped.length === 0) return '';
      return '<div>' + deduped.join(' ') + '</div>';
    }

    function applyExample(template, exampleMap) {
      if (!template) return '';
      let result = template;
      Object.keys(exampleMap).forEach((key) => {
        const token = `<${key}>`;
        result = result.split(token).join(exampleMap[key]);
      });
      return result;
    }

    function formatRequestBodyLabel(body) {
      if (!body) return '';
      if (body.startsWith('Fixture: ') || body.startsWith('Preset: ')) return body;
      return body;
    }

    function pushScenario(entry) {
      entries.push(entry);
    }

    function buildScenarioEntry(data, exampleMap) {
      const map = exampleMap || {};
      const name = applyExample(data.name, map);
      const method = applyExample(data.requestMethod || '', map);
      const endpoint = applyExample(data.endpoint || '', map);
      const requestBody = formatRequestBodyLabel(applyExample(data.requestBody || '', map));
      const objective = applyExample(data.objective || '', map);
      const tags = Array.from(new Set((data.tags || []).filter(Boolean)));
      const headers = (data.headers || []).map(header => ({
        key: applyExample(header.key || '', map),
        value: applyExample(header.value || '', map)
      }));
      const expectedStatus = applyExample(data.expectedStatus || '', map);
      const expectedHeader = data.expectedHeader
        ? {
          name: applyExample(data.expectedHeader.name || '', map),
          value: applyExample(data.expectedHeader.value || '', map)
        }
        : null;
      const documentationNotes = (data.documentationNotes || []).map(note => applyExample(note, map));
      const testGoalHtml = buildGoalHtml({
        objective,
        documentationNotes
      });

      pushScenario({
        name,
        feature: featureKey,
        tags,
        requestMethod: method,
        endpoint,
        requestBody,
        headers,
        objective,
        expectedStatus,
        expectedHeader,
        documentationNotes,
        testGoalHtml
      });
    }

    function endExamplesIfNeeded(line) {
      if (inExamples && line && !line.startsWith('|')) {
        inExamples = false;
        exampleHeaders = null;
      }
    }

    function finalizeScenario() {
      if (activeScenario && !activeScenario.isOutline) {
        buildScenarioEntry(activeScenario, null);
      }
    }

    function startScenario(name, tags, objective, isOutline) {
      activeScenario = {
        name,
        tags,
        objective,
        isOutline,
        requestMethod: '',
        endpoint: '',
        requestBody: '',
        headers: [],
        expectedStatus: '',
        expectedHeader: null,
        documentationNotes: []
      };
      outline = isOutline ? activeScenario : null;
    }
    function updateExpectationsFromStep(stepText) {
      if (!activeScenario) return;
      const statusMatch = stepText.match(/response status should be\s+"([^"]+)"/i);
      if (statusMatch) {
        activeScenario.expectedStatus = statusMatch[1];
      }

      const headerMatch = stepText.match(/mock response should include header\s+"([^"]+)"\s+with value\s+"([^"]+)"/i);
      if (headerMatch) {
        activeScenario.expectedHeader = { name: headerMatch[1], value: headerMatch[2] };
      }
    }

    function updateRequestFromStep(stepText) {
      if (!activeScenario) return;
      const bodyFromMatch = stepText.match(/I send a "([^"]+)" request to "([^"]*)" with request body from "([^"]+)"/i);
      if (bodyFromMatch) {
        activeScenario.requestMethod = bodyFromMatch[1];
        activeScenario.endpoint = bodyFromMatch[2];
        activeScenario.requestBody = `Fixture: ${bodyFromMatch[3]}`;
        return;
      }

      const bodyPresetMatch = stepText.match(/I send a "([^"]+)" request to "([^"]*)" with request body1/i);
      if (bodyPresetMatch) {
        activeScenario.requestMethod = bodyPresetMatch[1];
        activeScenario.endpoint = bodyPresetMatch[2];
        activeScenario.requestBody = 'Preset: request body1';
        return;
      }

      const requestMatch = stepText.match(/I send a "([^"]+)" request to "([^"]*)"/i);
      if (requestMatch) {
        activeScenario.requestMethod = requestMatch[1];
        activeScenario.endpoint = requestMatch[2];
      }
    }

    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('#')) {
        const comment = trimmed.replace(/^#\s?/, '').trim();
        if (!comment) return;
        if (comment.toLowerCase().startsWith('purpose:')) return;
        if (comment.toLowerCase().startsWith('feature:')) return;
        if (activeScenario) {
          activeScenario.documentationNotes.push(comment);
        } else {
          pendingComments.push(comment);
        }
        return;
      }

      endExamplesIfNeeded(trimmed);

      if (inExamples && trimmed.startsWith('|') && outline) {
        const cells = trimmed.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
        if (!exampleHeaders) {
          exampleHeaders = cells;
        } else if (exampleHeaders.length > 0) {
          const exampleMap = {};
          exampleHeaders.forEach((header, idx) => {
            exampleMap[header] = cells[idx] ?? '';
          });
          buildScenarioEntry(outline, exampleMap);
        }
        return;
      }

      if (!inExamples && trimmed.startsWith('|') && lastTableTarget === 'headers' && activeScenario) {
        const cells = trimmed.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
        if (cells.length >= 2) {
          activeScenario.headers.push({ key: cells[0], value: cells[1] });
        }
        return;
      }

      const tagsOnLine = getTagTokens(trimmed);
      if (tagsOnLine.length > 0) {
        pendingTags = pendingTags.concat(tagsOnLine);
        return;
      }

      const featureMatch = trimmed.match(/^Feature:\s*(.+)$/i);
      if (featureMatch) {
        featureTags = pendingTags.slice();
        pendingTags = [];
        pendingComments = [];
        return;
      }

      const scenarioMatch = trimmed.match(/^Scenario(?: Outline)?:\s*(.+)$/i);
      if (scenarioMatch && scenarioMatch[1]) {
        finalizeScenario();
        const scenarioName = scenarioMatch[1].trim();
        const tags = Array.from(new Set(featureTags.concat(pendingTags)));
        const objective = pendingComments.length > 0 ? pendingComments[pendingComments.length - 1] : '';
        const isOutline = /^Scenario\s+Outline:/i.test(trimmed);
        startScenario(scenarioName, tags, objective, isOutline);
        inExamples = false;
        exampleHeaders = null;
        lastTableTarget = null;
        pendingTags = [];
        pendingComments = [];
        return;
      }

      if (/^Examples:/i.test(trimmed) && outline) {
        inExamples = true;
        exampleHeaders = null;
        return;
      }

      const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
      if (stepMatch) {
        const stepText = stepMatch[2].trim();
        updateRequestFromStep(stepText);
        updateExpectationsFromStep(stepText);
        if (/^API authentication header is\s+/i.test(stepText)) {
          lastTableTarget = 'headers';
        } else {
          lastTableTarget = null;
        }
      }
    });

    finalizeScenario();
  });

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function getDocumentationData() {
  const featuresDir = path.join(__dirname, 'src', 'features');
  if (!fs.existsSync(featuresDir)) return { modules: [], scenarios: [] };

  const files = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.feature'))
    .map(entry => entry.name);

  const modules = [];
  const scenarios = [];

  files.forEach(fileName => {
    const content = fs.readFileSync(path.join(featuresDir, fileName), 'utf-8');
    const featureKey = fileName.replace(/\.feature$/i, '');
    let featureName = '';
    let featurePurpose = '';
    let pendingComments = [];
    let featureTags = [];
    let pendingTags = [];

    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('#')) {
        const comment = trimmed.replace(/^#\s?/, '').trim();
        if (comment.toLowerCase().startsWith('purpose:')) {
          featurePurpose = comment.replace(/^[Pp]urpose:\s*/, '').trim();
        } else if (comment.toLowerCase().startsWith('feature:') && !featureName) {
          featureName = comment.replace(/^[Ff]eature:\s*/, '').trim();
        } else if (comment) {
          pendingComments.push(comment);
        }
        return;
      }

      const tagsOnLine = getTagTokens(trimmed);
      if (tagsOnLine.length > 0) {
        pendingTags = pendingTags.concat(tagsOnLine);
        return;
      }

      const featureMatch = trimmed.match(/^Feature:\s*(.+)$/i);
      if (featureMatch) {
        featureName = featureMatch[1].trim();
        featureTags = pendingTags.slice();
        pendingTags = [];
        pendingComments = [];
        return;
      }

      const scenarioMatch = trimmed.match(/^Scenario(?: Outline)?:\s*(.+)$/i);
      if (scenarioMatch && scenarioMatch[1]) {
        const scenarioName = scenarioMatch[1].trim();
        const tags = Array.from(new Set(featureTags.concat(pendingTags)));
        const description = pendingComments.length > 0 ? pendingComments[pendingComments.length - 1] : '';
        scenarios.push({
          name: scenarioName,
          feature: featureKey,
          description,
          tags
        });
        pendingTags = [];
        pendingComments = [];
      }
    });

    modules.push({
      name: featureName || toModuleLabel(featureKey),
      key: featureKey,
      purpose: featurePurpose || featureName || toModuleLabel(featureKey)
    });
  });

  modules.sort((a, b) => a.name.localeCompare(b.name));
  scenarios.sort((a, b) => a.name.localeCompare(b.name));

  return { modules, scenarios };
}

function updateRunStateFromLine(line) {
  const cleanedLine = String(line).replace(/\u001b\[[0-9;]*m/g, '');
  const match = cleanedLine.match(/Scenario(?: Outline)?:\s*(.+)/i);
  if (!match || !match[1]) return;
  const cleaned = match[1].split('#')[0].trim();
  if (cleaned) runState.currentScenario = cleaned;
}

function getFeatureFiles() {
  const featuresDir = path.join(__dirname, 'src', 'features');
  if (!fs.existsSync(featuresDir)) return [];

  const files = fs.readdirSync(featuresDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.feature'))
    .map(entry => entry.name.replace(/\.feature$/i, ''))
    .sort((a, b) => a.localeCompare(b));

  return files;
}

function toModuleLabel(name) {
  if (!name) return '';
  const withSpaces = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return withSpaces.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1));
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isSupportedBaseUrl(value) {
  return /^https?:\/\//i.test(value) || /^mock:\/\//i.test(value) || /^demo:\/\//i.test(value);
}

function getBaseUrlLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mock://local') return 'mock';
  if (normalized === 'https://esi.test.cloud.jewels.com/custom-export') return 'esi-test';
  if (normalized === 'https://swift.techwithjatin.com/api/auth') return 'basic-api-test';
  if (normalized === 'https://httpbin.org/bearer') return 'bearer-token-test';
  return value || '';
}

function getBaseUrlOptions() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return [];
  const raw = fs.readFileSync(envPath, 'utf-8');
  const entries = [];
  let preferred = '';
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = stripQuotes(trimmed.slice(idx + 1));
    if (!value) return;
    if (/^BASE_URL\d*$/.test(key) || /^BASE_url\d*$/.test(key)) {
      if (isSupportedBaseUrl(value)) {
        entries.push({ key, value });
        if (!/\d+$/.test(key) && !preferred) {
          preferred = value;
        }
      }
    }
  });
  const unique = [];
  const seen = new Set();
  entries.forEach(entry => {
    if (seen.has(entry.value)) return;
    seen.add(entry.value);
    unique.push(entry);
  });
  return {
    options: unique.map(entry => ({ label: getBaseUrlLabel(entry.value), value: entry.value })),
    preferred
  };
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/reports', express.static(path.join(__dirname, 'test-reports'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => {
  const scenarioTags = getScenarioTags();
  const scenarioEntries = getScenarioEntries();
  const featureFiles = getFeatureFiles();
  const baseUrlConfig = getBaseUrlOptions();
  const baseUrlOptions = baseUrlConfig.options || [];
  const defaultBaseUrl = baseUrlConfig.preferred || baseUrlOptions[0]?.value || 'https://esi.test.cloud.jewels.com/custom-export';
  const defaultBaseUrlLabel = getBaseUrlLabel(defaultBaseUrl) || 'Default';
  const documentationData = getDocumentationData();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Dashboard</title>
      <style>
        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #f4f6fb;
          margin: 0;
          padding: 0;
          min-height: 100%;
          overflow: auto;
          color: #1f2937;
        }
        .page { display: block; }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
        }
        .topbar h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        .topbar .actions {
          display: flex;
          gap: 10px;
        }
        .topbar .actions a {
          text-decoration: none;
          color: #fff;
          background: rgba(255, 255, 255, 0.18);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
          gap: 14px;
          padding: 14px;
          align-content: start;
        }
        .panel {
          background: #fff;
          border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
          padding: 14px;
          display: flex;
          flex-direction: column;
        }
        .panel h2 {
          margin: 0 0 10px 0;
          font-size: 16px;
          border-bottom: 1px solid #eef0f6;
          padding-bottom: 6px;
          color: #374151;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        label {
          font-size: 12px;
          font-weight: 600;
          color: #4b5563;
          display: block;
          margin-bottom: 4px;
        }
        .info-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid #cbd5f5;
          color: #4f46e5;
          font-size: 11px;
          text-decoration: none;
          background: #eef2ff;
          position: relative;
        }
        .info-btn::after {
          content: attr(data-tooltip);
          position: absolute;
          left: 50%;
          transform: translateX(-40%);
          bottom: calc(100% + 6px);
          background: #111827;
          color: #fff;
          font-size: 11px;
          padding: 6px 8px;
          border-radius: 6px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
        }
        .info-btn:hover::after {
          opacity: 1;
        }
        .docs-panel {
          margin: 0 14px 14px;
        }
        .docs-panel h2 {
          margin: 0 0 10px 0;
          font-size: 16px;
          border-bottom: 1px solid #eef0f6;
          padding-bottom: 6px;
          color: #374151;
        }
        .docs-panel p {
          margin: 6px 0;
          font-size: 12px;
          color: #4b5563;
          line-height: 1.5;
        }
        .docs-panel ul {
          margin: 6px 0 0 18px;
          padding: 0;
          font-size: 12px;
          color: #4b5563;
        }
        .doc-section {
          border: 1px solid #eef0f6;
          border-radius: 8px;
          padding: 8px 10px;
          margin-bottom: 8px;
          background: #f9fafb;
        }
        .doc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          cursor: pointer;
        }
        .doc-title {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }
        .doc-toggle {
          width: 18px;
          height: 18px;
          border-radius: 6px;
          border: 1px solid #cbd5f5;
          background: #eef2ff;
          color: #4f46e5;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .doc-content {
          display: none;
          margin-top: 6px;
        }
        .doc-section.open .doc-content {
          display: block;
        }
        .label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .label-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #4b5563;
        }
        .label-hint {
          font-weight: 500;
          color: #9ca3af;
          font-size: 11px;
        }
        input[type="text"], select, textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
        }
        textarea { resize: none; height: 60px; }
        .checkbox-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          overflow: auto;
          max-height: 220px;
        }
        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .multi-select {
          position: relative;
        }
        .multi-select-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
          font-size: 13px;
          color: #111827;
        }
        .multi-select-caret {
          color: #6b7280;
          font-size: 12px;
        }
        .multi-select-menu {
          position: absolute;
          z-index: 20;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          width: 100%;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 20px rgba(0,0,0,0.08);
          padding: 8px;
          max-height: 220px;
          overflow: auto;
          display: none;
        }
        .multi-select-menu.open {
          display: block;
        }
        .multi-select-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 6px;
        }
        .btn {
          background: #4f46e5;
          color: #fff;
          border: none;
          padding: 10px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }
        .btn.secondary { background: #10b981; }
        .btn.light { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          background: #f3f4f6;
          color: #374151;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 10px;
        }
        .stat {
          background: #f9fafb;
          border: 1px solid #eef0f6;
          border-radius: 8px;
          padding: 10px;
          text-align: center;
        }
        .stat strong { display: block; font-size: 18px; }
        .chart {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          height: 120px;
          padding: 10px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #eef0f6;
        }
        .bar {
          flex: 1;
          background: #e5e7eb;
          border-radius: 6px 6px 0 0;
          position: relative;
          overflow: hidden;
        }
        .bar span {
          position: absolute;
          bottom: 6px;
          left: 6px;
          font-size: 11px;
          color: #fff;
          font-weight: 600;
        }
        .bar.passed { background: #22c55e; }
        .bar.failed { background: #ef4444; }
        .bar.skipped { background: #f59e0b; }
        .bar.total { background: #6366f1; }
        .scroll-area {
          overflow: auto;
          flex: 1;
          min-height: 0;
          border: 1px solid #eef0f6;
          border-radius: 8px;
          padding: 8px;
          background: #f9fafb;
        }
        .scenario-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .scenario-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 6px;
          background: #f3f4f6;
          color: #374151;
        }
        .scenario-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
        }
        .scenario-item .name {
          flex: 1;
        }
        .scenario-item .expand-btn {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 999px;
          cursor: pointer;
        }
        .scenario-item-details {
          display: none;
          padding: 6px 8px;
          margin-top: 6px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 11px;
          color: #4b5563;
        }
        .scenario-item.open .scenario-item-details { display: block; }
        .scenario-item.active {
          background: #dbeafe;
          color: #1d4ed8;
          font-weight: 600;
        }
        .scenario-status {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 999px;
          background: #e5e7eb;
          color: #374151;
          text-transform: capitalize;
        }
        .scenario-status.status-passed { background: #dcfce7; color: #166534; }
        .scenario-status.status-failed { background: #fee2e2; color: #991b1b; }
        .scenario-status.status-skipped { background: #fef3c7; color: #92400e; }
        .scenario-status.status-running { background: #dbeafe; color: #1d4ed8; }
        .scenario-status.status-completed { background: #e5e7eb; color: #374151; }
        .scenario-status.status-unknown { background: #e5e7eb; color: #374151; }
        .scenario-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }
        .scenario-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .nav-pill {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          cursor: pointer;
        }
        .nav-pill.active {
          background: #111827;
          color: #fff;
          border-color: #111827;
        }
        .scenario-details {
          margin-top: 8px;
          border: 1px solid #eef0f6;
          border-radius: 8px;
          background: #f9fafb;
          padding: 10px;
          display: none;
        }
        .scenario-details.open { display: block; }
        .scenario-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .nav-help {
          font-size: 11px;
          color: #6b7280;
          margin-top: 6px;
        }
        .nav-help-item {
          display: none;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 6px 8px;
        }
        .nav-help-item.active { display: block; }
        .detail-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #fff;
          padding: 8px;
        }
        .detail-card h3 {
          margin: 0 0 6px 0;
          font-size: 13px;
          color: #374151;
        }
        .detail-body {
          font-size: 12px;
          color: #4b5563;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          padding: 4px 0;
          border-bottom: 1px dashed #e5e7eb;
        }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #6b7280; }
        .detail-value { color: #111827; font-weight: 600; }
        .detail-list {
          margin: 6px 0 0 16px;
          padding: 0;
        }
        .log-item { margin-bottom: 8px; font-size: 12px; }
        .log-item strong { color: #111827; }
        .section-split {
          display: grid;
          grid-template-rows: 1fr 1fr;
          gap: 8px;
          min-height: 0;
          height: 100%;
          flex: 1;
        }
        .sub-panel {
          border: 1px solid #eef0f6;
          border-radius: 8px;
          padding: 10px;
          background: #f9fafb;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .sub-panel h2 {
          margin: 0 0 8px 0;
          font-size: 14px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 6px;
          color: #374151;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="topbar">
          <h1>Test Dashboard</h1>
          <div class="actions">
            <a href="/report/view" target="_blank">View HTML</a>
            <a href="/download/html">Download HTML</a>
            <a href="/download/excel">Download Status Report</a>
            <a href="#documentation">Documentation</a>
          </div>
        </div>

        <div class="grid">
          <section class="panel">
            <h2>Environment & Run</h2>
            <form id="runForm">
              <div class="form-grid">
                <div>
                  <label for="environment" class="label-row">
                    <span class="label-title">Environment
                      <a class="info-btn" href="#documentation" data-doc="doc-environment" data-tooltip="Pick the target environment base URL.">i</a>
                    </span>
                  </label>
                  <select id="environment" name="environment">
                    ${baseUrlOptions.length === 0
                      ? `<option value="default" data-url="${defaultBaseUrl}">${defaultBaseUrlLabel}</option>`
                      : baseUrlOptions.map(option => `
                        <option value="${option.value}" data-url="${option.value}">${option.label}</option>
                      `).join('')
                    }
                  </select>
                </div>
                <input type="hidden" id="baseUrl" name="baseUrl" value="${defaultBaseUrl}">
                <!-- Authentication token handled via environment or helpers -->
                <!-- Scenario name filter removed from UI; use tags or environment-driven names in requests -->
              </div>
              <div style="margin-top:12px;">
                <div class="label-row" style="margin-bottom:6px;">
                  <span class="label-title">Modules
                    <a class="info-btn" href="#documentation" data-doc="doc-modules" data-tooltip="Choose feature files to include in the run.">i</a>
                  </span>
                  <span class="label-hint" id="featureCount">0 selected</span>
                </div>
                <div class="multi-select" id="featureFilter">
                  <button type="button" class="multi-select-toggle" id="featureToggle">
                    <span>Select modules</span>
                    <span class="multi-select-caret">v</span>
                  </button>
                  <div class="multi-select-menu" id="featureMenu">
                    <label class="checkbox-item" style="margin:0;">
                      <input type="checkbox" id="selectAllFeatures"> Select all
                    </label>
                    <div class="multi-select-list" id="featureList">
                      ${featureFiles.length === 0
                        ? '<div style="font-size:12px; color:#6b7280;">No feature files found.</div>'
                        : featureFiles.map(file => `
                          <label class="checkbox-item">
                            <input type="checkbox" name="features" value="${file}">
                            ${toModuleLabel(file)}
                          </label>
                        `).join('')
                      }
                    </div>
                  </div>
                </div>
              </div>
              <div style="margin-top:12px;">
                <div class="label-row" style="margin-bottom:6px;">
                  <span class="label-title">Scenarios
                    <a class="info-btn" href="#documentation" data-doc="doc-scenarios" data-tooltip="Refine to specific scenario tags.">i</a>
                  </span>
                  <span class="label-hint" id="scenarioCount">0 selected</span>
                </div>
                <div class="multi-select" id="scenarioFilter">
                  <button type="button" class="multi-select-toggle" id="scenarioToggle">
                    <span>Select scenarios</span>
                    <span class="multi-select-caret">v</span>
                  </button>
                  <div class="multi-select-menu" id="scenarioMenu">
                    <label class="checkbox-item" style="margin:0;">
                      <input type="checkbox" id="selectAllScenarios"> Select all
                    </label>
                    <div class="multi-select-list" id="scenarioList">
                      ${scenarioTags.length === 0
                        ? '<div style="font-size:12px; color:#6b7280;">No scenario tags found.</div>'
                        : scenarioTags.map(tag => `
                          <label class="checkbox-item">
                            <input type="checkbox" name="scenarios" value="${tag}">
                            ${tag}
                          </label>
                        `).join('')
                      }
                    </div>
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                <button class="btn" type="submit" id="runBtn">▶️ Run Tests</button>
                <span class="status-pill" id="runStatus">Idle</span>
              </div>
            </form>
          </section>

          <section class="panel">
            <h2>Scenarios</h2>
            <div class="scenario-toolbar">
              <div class="scenario-nav" id="scenarioNav">
                <button type="button" class="nav-pill active" data-tag="">All</button>
                <button type="button" class="nav-pill" data-tag="@positive">Positive</button>
                <button type="button" class="nav-pill" data-tag="@negative">Negative</button>
                <button type="button" class="nav-pill" data-tag="@business-exception">Business Exception</button>
                <button type="button" class="nav-pill" data-tag="@technical-exception">Technical Exception</button>
              </div>
              <button type="button" class="btn light" id="toggleScenarioDetails" title="Expand to show test configuration and relevant scenarios">+</button>
            </div>
            <div class="nav-help" id="navHelp">
              <div class="nav-help-item active" data-tag=""><strong>All</strong> shows every scenario for the selected modules.</div>
              <div class="nav-help-item" data-tag="@positive"><strong>Positive</strong> - verify correct behavior with valid inputs and expected conditions.</div>
              <div class="nav-help-item" data-tag="@negative"><strong>Negative</strong> - check system response to invalid inputs or unexpected user actions.</div>
              <div class="nav-help-item" data-tag="@business-exception"><strong>Business Exception</strong> flags domain-specific failures.</div>
              <div class="nav-help-item" data-tag="@technical-exception"><strong>Technical Exception</strong> flags system/infra failures.</div>
            </div>
            <div class="scenario-details" id="scenarioDetails">
              <div class="scenario-details-grid">
                <div class="detail-card">
                  <h3>Test config</h3>
                  <div class="detail-body" id="lastRunConfig">No run recorded yet.</div>
                </div>
                <div class="detail-card">
                  <h3>Relevant test cases</h3>
                  <div class="detail-body" id="relevantScenarios">Select a category or run tests to see matching scenarios.</div>
                </div>
              </div>
            </div>
            <div class="scroll-area scenario-list" id="scenarioNameList">
              ${scenarioEntries.length === 0
                ? '<div id="scenarioNameEmpty" style="font-size:12px; color:#6b7280;">No scenarios found.</div>'
                : scenarioEntries.map(entry => `
                  <div class="scenario-item" data-scenario-name="${entry.name}" data-feature="${entry.feature}" data-tags="${entry.tags.join('|')}">
                    <div class="scenario-item-header">
                      <span class="name">${entry.name}</span>
                      <button type="button" class="expand-btn" title="Expand to show scenario details">+</button>
                      <span class="scenario-status status-unknown">unknown</span>
                    </div>
                    <div class="scenario-item-details">
                      <div><strong>Module:</strong> ${entry.feature}</div>
                      <div><strong>Tags:</strong> ${entry.tags.length ? entry.tags.join(', ') : 'None'}</div>
                      <div><strong>Request method:</strong> ${entry.requestMethod || '—'}</div>
                      <div><strong>Endpoint:</strong> ${entry.endpoint || '—'}</div>
                      <div><strong>Domain URL:</strong> <span data-config="baseUrl">—</span></div>
                      <div><strong>Request body:</strong> ${entry.requestBody || 'None'}</div>
                      <div><strong>Headers:</strong> ${entry.headers && entry.headers.length > 0 ? entry.headers.map(header => `${header.key}: ${header.value || '—'}`).join('<br/>') : 'None'}</div>
                      <div><strong>Test goal:</strong> ${entry.testGoalHtml || entry.objective || ''}</div>
                      <div><strong>Environment:</strong> <span data-config="environment">—</span></div>
                      <div><strong>Tag filter:</strong> <span data-config="tagFilter">—</span></div>
                      <div><strong>Scenario tags:</strong> <span data-config="scenarioTags">—</span></div>
                    </div>
                  </div>
                `).join('') + '<div id="scenarioNameEmpty" style="font-size:12px; color:#6b7280; display:none;">No scenarios match the current selection.</div>'
              }
            </div>
          </section>

          <section class="panel">
            <h2>Run Summary & Status</h2>
            <div class="summary-grid">
              <div class="stat"><strong id="totalCount">0</strong>Total</div>
              <div class="stat"><strong id="passedCount">0</strong>Passed</div>
              <div class="stat"><strong id="failedCount">0</strong>Failed</div>
              <div class="stat"><strong id="skippedCount">0</strong>Skipped</div>
            </div>
            <div class="chart" id="statusChart">
              <div class="bar total" id="barTotal"><span>Total</span></div>
              <div class="bar passed" id="barPassed"><span>Passed</span></div>
              <div class="bar failed" id="barFailed"><span>Failed</span></div>
              <div class="bar skipped" id="barSkipped"><span>Skipped</span></div>
            </div>
            <div style="margin-top:8px; font-size:12px; color:#6b7280;">
              Last update: <span id="lastUpdated">—</span>
              <span style="margin:0 6px;">|</span>
              Duration: <span id="runDuration">—</span>
            </div>
          </section>

          <section class="panel">
            <h2>Logs</h2>
            <div class="scroll-area" id="logArea"></div>
          </section>
        </div>
      </div>

      <section class="panel docs-panel" id="documentation">
        <h2>Documentation</h2>
        <div class="doc-section" id="doc-environment">
          <div class="doc-header">
            <span class="doc-title">Environment</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>Environment picks the base URL used for API requests. The default is selected from .env (first BASE_URL entry or preferred value).</p>
            <ul>
              <li>Default base URL: ${defaultBaseUrlLabel}</li>
              <li>Available options: ${baseUrlOptions.length === 0 ? 'None found in .env' : baseUrlOptions.map(option => option.label).join(', ')}</li>
            </ul>
          </div>
        </div>
        <div class="doc-section" id="doc-modules">
          <div class="doc-header">
            <span class="doc-title">Modules</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>Modules represent feature files. Selecting modules restricts the run to those features, which helps keep test runs targeted and faster.</p>
            <ul>
              ${documentationData.modules.length === 0
                ? '<li>No modules found.</li>'
                : documentationData.modules.map(mod => `
                  <li>${mod.name} (${mod.key}): ${mod.purpose}</li>
                `).join('')
              }
            </ul>
          </div>
        </div>
        <div class="doc-section" id="doc-scenarios">
          <div class="doc-header">
            <span class="doc-title">Scenarios</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>Scenarios are tag-based selectors that refine which scenarios inside the selected modules will execute. Use them to target specific behaviors or data-driven checks.</p>
            <ul>
              ${documentationData.scenarios.length === 0
                ? '<li>No scenarios found.</li>'
                : documentationData.scenarios.map(item => `
                  <li>${item.name} (${item.feature}): ${item.description || 'Scenario execution and validation.'}</li>
                `).join('')
              }
            </ul>
          </div>
        </div>
        <div class="doc-section" id="doc-controls">
          <div class="doc-header">
            <span class="doc-title">Dashboard Controls</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>The dashboard provides interactive controls for better usability:</p>
            <ul>
              <li><strong>Expand/Collapse Buttons (+ / −):</strong> Click the "+" button to expand sections and view details. When expanded, it changes to "−" to collapse. Hover over buttons to see tooltips explaining their function.</li>
              <li><strong>Multi-Select Dropdowns:</strong> Click dropdown toggles to select multiple modules or scenarios. Use "Select all" checkboxes for quick selection.</li>
              <li><strong>Info Icons (i):</strong> Hover over "i" buttons next to labels for quick help and explanations.</li>
              <li><strong>Scenario Items:</strong> Each scenario has an expand button to reveal full details including module, tags, request method, endpoint, headers, and test goals.</li>
            </ul>
          </div>
        </div>
        <div class="doc-section" id="doc-category-filters">
          <div class="doc-header">
            <span class="doc-title">Category Filters</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>The Scenarios section includes category filter pills for quick filtering:</p>
            <ul>
              <li><strong>All:</strong> Shows every scenario for the selected modules without filtering.</li>
              <li><strong>Positive:</strong> Displays scenarios that verify correct behavior with valid inputs and expected conditions.</li>
              <li><strong>Negative:</strong> Shows scenarios that check system response to invalid inputs or unexpected user actions.</li>
              <li><strong>Business Exception:</strong> Filters scenarios that flag domain-specific business rule failures.</li>
              <li><strong>Technical Exception:</strong> Displays scenarios that flag system/infrastructure failures.</li>
            </ul>
            <p>Click any category pill to filter scenarios. The active category is highlighted and shows relevant help text below the filters.</p>
          </div>
        </div>
        <div class="doc-section" id="doc-test-config">
          <div class="doc-header">
            <span class="doc-title">Test Configuration</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>Click the "+" button in the scenario toolbar to view test configuration details:</p>
            <ul>
              <li><strong>Test Config:</strong> Shows the last run configuration including base URL, environment, selected features, tags, and scenario filters.</li>
              <li><strong>Relevant Test Cases:</strong> Lists scenarios matching the selected category filter, helping you understand test coverage.</li>
            </ul>
            <p>This information updates after each test run and when you switch category filters.</p>
          </div>
        </div>
        <div class="doc-section" id="doc-results">
          <div class="doc-header">
            <span class="doc-title">Results & Statistics</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>The Run Summary section displays comprehensive test results:</p>
            <ul>
              <li><strong>Statistics:</strong> Shows Total, Passed, Failed, and Skipped scenario counts.</li>
              <li><strong>Visual Chart:</strong> Color-coded bar chart representing test results (green for passed, red for failed, gray for skipped).</li>
              <li><strong>Last Update:</strong> Timestamp showing when results were last refreshed.</li>
              <li><strong>Duration:</strong> Total test execution time in milliseconds.</li>
            </ul>
            <p>Results update automatically as tests complete.</p>
          </div>
        </div>
        <div class="doc-section" id="doc-logs">
          <div class="doc-header">
            <span class="doc-title">Logs</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>The Logs section displays detailed execution information:</p>
            <ul>
              <li><strong>Failed Scenarios:</strong> Shows scenario names, failed steps, and error messages for debugging.</li>
              <li><strong>Auto-scroll:</strong> Automatically scrolls to show the latest log entries.</li>
              <li><strong>Color Coding:</strong> Failed items are highlighted in red for easy identification.</li>
              <li><strong>Limit:</strong> Displays up to 200 most recent log entries for performance.</li>
            </ul>
          </div>
        </div>
        <div class="doc-section" id="doc-reports">
          <div class="doc-header">
            <span class="doc-title">Reports & Downloads</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <p>Access detailed reports through these options:</p>
            <ul>
              <li><strong>View HTML Report:</strong> Opens the Cucumber HTML report in a new browser tab with detailed scenario breakdown.</li>
              <li><strong>Download Excel Report:</strong> Downloads the latest test results as an Excel spreadsheet for offline analysis and sharing.</li>
              <li><strong>Download HTML Report:</strong> Downloads the HTML report file to your local machine.</li>
            </ul>
            <p>Reports are automatically generated after each test run and include comprehensive details about each scenario, step, and result.</p>
          </div>
        </div>
        <div class="doc-section" id="doc-what">
          <div class="doc-header">
            <span class="doc-title">What it tests</span>
            <button type="button" class="doc-toggle" aria-expanded="false">+</button>
          </div>
          <div class="doc-content">
            <ul>
              <li><strong>Tag Filter:</strong> Focuses the run on scenarios marked for a specific purpose like smoke, regression, or sanity testing.</li>
              <li><strong>Modules:</strong> Control which business areas (feature files) are executed, allowing targeted testing of specific functionality.</li>
              <li><strong>Scenarios:</strong> Further narrow execution to specific tagged test cases within selected modules.</li>
              <li><strong>Combined Filters:</strong> Tag filters, modules, and scenario selections work together to provide precise test targeting and execution control.</li>
            </ul>
          </div>
        </div>
      </section>

      <script src="https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js"></script>
      <script>
        const runForm = document.getElementById('runForm');
        const runStatus = document.getElementById('runStatus');
        const runBtn = document.getElementById('runBtn');
        const selectAll = document.getElementById('selectAllFeatures');
        const featureList = document.getElementById('featureList');
        const envSelect = document.getElementById('environment');
        const baseUrlInput = document.getElementById('baseUrl');
        const scenarioList = document.getElementById('scenarioList');
        const selectAllScenarios = document.getElementById('selectAllScenarios');
        const featureFilter = document.getElementById('featureFilter');
        const featureToggle = document.getElementById('featureToggle');
        const featureMenu = document.getElementById('featureMenu');
        const featureCount = document.getElementById('featureCount');
        const scenarioFilter = document.getElementById('scenarioFilter');
        const scenarioToggle = document.getElementById('scenarioToggle');
        const scenarioMenu = document.getElementById('scenarioMenu');
        const scenarioCount = document.getElementById('scenarioCount');
        const scenarioNameList = document.getElementById('scenarioNameList');
        const currentScenario = document.getElementById('currentScenario');
        const scenarioNameEmpty = document.getElementById('scenarioNameEmpty');
        const scenarioNav = document.getElementById('scenarioNav');
        const scenarioNavButtons = document.querySelectorAll('.nav-pill');
        const toggleScenarioDetails = document.getElementById('toggleScenarioDetails');
        const navHelp = document.getElementById('navHelp');
        const scenarioDetails = document.getElementById('scenarioDetails');
        const lastRunConfigEl = document.getElementById('lastRunConfig');
        const relevantScenariosEl = document.getElementById('relevantScenarios');
        let lastScenarioStatusMap = {};
        let forcedStatusMap = {};
        let lastRunningScenario = '';
        let scenarioStatusInterval = null;
        let runStartedAt = 0;
        let activeCategoryTag = '';
        let lastRunConfig = null;
        const BASE_URL_LABELS = {
          'mock://local': 'mock',
          'https://esi.test.cloud.jewels.com/custom-export': 'esi-test',
          'https://swift.techwithjatin.com/api/auth': 'basic-api-test',
          'https://httpbin.org/bearer': 'bearer token-test'
        };
                function escapeHtml(value) {
                  return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                }

                function formatBaseUrlLabel(value) {
                  const key = String(value || '').trim().toLowerCase();
                  return BASE_URL_LABELS[key] || value || '—';
                }

                function parseTagTokens(tagExpression) {
                  if (!tagExpression) return [];
                  const matches = String(tagExpression).match(/@\w[\w-]*/g);
                  return matches ? Array.from(new Set(matches)) : [];
                }

                function normalizeScenarioTags(tags) {
                  if (!Array.isArray(tags)) return [];
                  return Array.from(new Set(tags.filter(Boolean)));
                }

                function renderLastRunConfig() {
                  if (!lastRunConfigEl) return;
                  if (!lastRunConfig) {
                    lastRunConfigEl.textContent = 'No run recorded yet.';
                    return;
                  }

                  const features = (lastRunConfig.features || []).join(', ') || 'All features';
                  const scenarioTags = normalizeScenarioTags(lastRunConfig.scenarioTags || []).join(', ') || 'None';
                  const tagFilter = lastRunConfig.tags || 'None';
                  const environment = lastRunConfig.environment || 'Default';
                  const startedAt = lastRunConfig.startedAt ? new Date(lastRunConfig.startedAt).toLocaleString() : '—';

                  const baseUrlLabel = formatBaseUrlLabel(lastRunConfig.baseUrl || '');
                  lastRunConfigEl.innerHTML = [
                    '<div class="detail-row"><span class="detail-label">Base URL</span><span class="detail-value">' + escapeHtml(baseUrlLabel) + '</span></div>',
                    '<div class="detail-row"><span class="detail-label">Environment</span><span class="detail-value">' + escapeHtml(environment) + '</span></div>',
                    '<div class="detail-row"><span class="detail-label">Features</span><span class="detail-value">' + escapeHtml(features) + '</span></div>',
                    '<div class="detail-row"><span class="detail-label">Tag filter</span><span class="detail-value">' + escapeHtml(tagFilter) + '</span></div>',
                    '<div class="detail-row"><span class="detail-label">Scenario tags</span><span class="detail-value">' + escapeHtml(scenarioTags) + '</span></div>',
                    '<div class="detail-row"><span class="detail-label">Started</span><span class="detail-value">' + escapeHtml(startedAt) + '</span></div>'
                  ].join('');
                  updateScenarioItemDetails();
                }

                function updateScenarioItemDetails() {
                  if (!scenarioNameList) return;
                  const baseUrl = formatBaseUrlLabel(lastRunConfig?.baseUrl || '');
                  const environment = lastRunConfig?.environment || 'Default';
                  const tagFilter = lastRunConfig?.tags || 'None';
                  const scenarioTags = normalizeScenarioTags(lastRunConfig?.scenarioTags).length > 0
                    ? normalizeScenarioTags(lastRunConfig?.scenarioTags).join(', ')
                    : 'None';

                  scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
                    const baseUrlEl = item.querySelector('[data-config="baseUrl"]');
                    const envEl = item.querySelector('[data-config="environment"]');
                    const tagFilterEl = item.querySelector('[data-config="tagFilter"]');
                    const scenarioTagsEl = item.querySelector('[data-config="scenarioTags"]');
                    if (baseUrlEl) baseUrlEl.textContent = baseUrl;
                    if (envEl) envEl.textContent = environment;
                    if (tagFilterEl) tagFilterEl.textContent = tagFilter;
                    if (scenarioTagsEl) scenarioTagsEl.textContent = scenarioTags;
                  });
                }

                function updateRelevantScenarios() {
                  if (!relevantScenariosEl) return;
                  if (!scenarioNameList) return;

                  if (!lastRunConfig) {
                    relevantScenariosEl.textContent = 'No run recorded yet.';
                    return;
                  }

                  const tagFilterTokens = parseTagTokens(lastRunConfig.tags || '');
                  const scenarioTags = normalizeScenarioTags(lastRunConfig.scenarioTags);
                  const selectedFeatures = Array.isArray(lastRunConfig.features) ? lastRunConfig.features : [];
                  const baseUrl = formatBaseUrlLabel(lastRunConfig.baseUrl || '');
                  const environment = lastRunConfig.environment || 'Default';
                  const tagFilter = lastRunConfig.tags || 'None';
                  const scenarioTagLabel = scenarioTags.length > 0 ? scenarioTags.join(', ') : 'None';

                  const matches = [];
                  scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
                    const feature = item.getAttribute('data-feature') || '';
                    const tags = (item.getAttribute('data-tags') || '').split('|').filter(Boolean);
                    const name = item.getAttribute('data-scenario-name') || '';

                    const featureMatch = selectedFeatures.length === 0 || selectedFeatures.includes(feature);
                    const tagFilterMatch = tagFilterTokens.length === 0 || tags.some(tag => tagFilterTokens.includes(tag));
                    const scenarioTagMatch = scenarioTags.length === 0 || tags.some(tag => scenarioTags.includes(tag));
                    const categoryMatch = !activeCategoryTag || tags.includes(activeCategoryTag);

                    if (featureMatch && tagFilterMatch && scenarioTagMatch && categoryMatch) {
                      matches.push({ name, feature, tags });
                    }
                  });

                  if (matches.length === 0) {
                    relevantScenariosEl.textContent = 'No scenarios match the last run config with the selected category.';
                    return;
                  }

                  relevantScenariosEl.innerHTML = '<div>' + matches.length + ' scenario(s)</div>' +
                    '<ul class="detail-list">' + matches.map(item => {
                      const tagLabel = item.tags.length > 0 ? item.tags.join(', ') : 'None';
                      return '<li>' +
                        '<div><strong>' + escapeHtml(item.name) + '</strong></div>' +
                        '<div>Module: ' + escapeHtml(item.feature) + '</div>' +
                        '<div>Tags: ' + escapeHtml(tagLabel) + '</div>' +
                        '<div>Base URL: ' + escapeHtml(baseUrl) + '</div>' +
                        '<div>Environment: ' + escapeHtml(environment) + '</div>' +
                        '<div>Tag filter: ' + escapeHtml(tagFilter) + '</div>' +
                        '<div>Scenario tags: ' + escapeHtml(scenarioTagLabel) + '</div>' +
                      '</li>';
                    }).join('') + '</ul>';
                }

                async function loadLastRunConfig() {
                  try {
                    const res = await fetch('/run/config');
                    const data = await res.json();
                    lastRunConfig = data.lastConfig || null;
                    renderLastRunConfig();
                    updateRelevantScenarios();
                  } catch (e) {
                    // Ignore config load errors.
                  }
                }
        const docToggles = document.querySelectorAll('.doc-toggle');
        const infoButtons = document.querySelectorAll('.info-btn[data-doc]');

        docToggles.forEach(toggle => {
          toggle.addEventListener('click', () => {
            const section = toggle.closest('.doc-section');
            if (!section) return;
            const isOpen = section.classList.toggle('open');
            toggle.textContent = isOpen ? '-' : '+';
            toggle.setAttribute('aria-expanded', String(isOpen));
          });
        });

        function openDocSection(sectionId) {
          if (!sectionId) return;
          const section = document.getElementById(sectionId);
          if (!section) return;
          const toggle = section.querySelector('.doc-toggle');
          if (toggle && !section.classList.contains('open')) {
            section.classList.add('open');
            toggle.textContent = '-';
            toggle.setAttribute('aria-expanded', 'true');
          }
        }

        infoButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-doc');
            openDocSection(targetId);
          });
        });

        function updateSelectAllState(listEl, selectAllEl) {
          if (!listEl || !selectAllEl) return;
          const items = listEl.querySelectorAll('input[type="checkbox"]');
          if (items.length === 0) return;
          const checked = listEl.querySelectorAll('input[type="checkbox"]:checked');
          selectAllEl.checked = checked.length === items.length;
        }

        function getSelectedValues(listEl) {
          if (!listEl) return [];
          return Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        }

        function updateScenarioVisibility() {
          if (!scenarioNameList) return;
          const selectedFeatures = getSelectedValues(featureList);
          const selectedScenarioTags = getSelectedValues(scenarioList);
          const selectedTags = selectedScenarioTags;
          const hasSelection = selectedFeatures.length > 0 || selectedTags.length > 0;

          function applyScenarioFilter(options) {
            let count = 0;
            scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
              const feature = item.getAttribute('data-feature') || '';
              const tags = (item.getAttribute('data-tags') || '').split('|').filter(Boolean);
              const featureMatch = selectedFeatures.length === 0 || selectedFeatures.includes(feature);
              const tagMatch = !options.includeTags || options.tags.length === 0 || tags.some(tag => options.tags.includes(tag));
              const categoryMatch = !options.includeCategory || !activeCategoryTag || tags.includes(activeCategoryTag);
              const isVisible = featureMatch && tagMatch && categoryMatch;
              const showItem = hasSelection && isVisible;
              item.style.display = showItem ? '' : 'none';
              if (showItem) count += 1;
            });
            return count;
          }

          let visibleCount = applyScenarioFilter({ includeTags: true, includeCategory: true, tags: selectedTags });
          if (visibleCount === 0 && selectedFeatures.length > 0 && (selectedTags.length > 0 || activeCategoryTag)) {
            visibleCount = applyScenarioFilter({ includeTags: false, includeCategory: false, tags: [] });
          }

          if (scenarioNameEmpty) {
            scenarioNameEmpty.textContent = hasSelection
              ? 'No scenarios match the current selection.'
              : 'Select modules or tags to see scenarios.';
            scenarioNameEmpty.style.display = visibleCount === 0 ? '' : 'none';
          }
        }

        function updateFeatureSelection() {
          if (!featureList || !featureCount) return;
          const checked = featureList.querySelectorAll('input[type="checkbox"]:checked');
          featureCount.textContent = checked.length + ' selected';
          updateSelectAllState(featureList, selectAll);
          updateScenarioVisibility();
          updateRelevantScenarios();
        }

        function updateScenarioSelection() {
          if (!scenarioList || !scenarioCount) return;
          const checked = scenarioList.querySelectorAll('input[type="checkbox"]:checked');
          scenarioCount.textContent = checked.length + ' selected';
          updateSelectAllState(scenarioList, selectAllScenarios);
          updateScenarioVisibility();
          updateRelevantScenarios();
        }

        selectAll.addEventListener('change', () => {
          if (!featureList) return;
          featureList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selectAll.checked;
          });
          updateFeatureSelection();
        });

        if (selectAllScenarios) {
          selectAllScenarios.addEventListener('change', () => {
            if (!scenarioList) return;
            scenarioList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              cb.checked = selectAllScenarios.checked;
            });
            updateScenarioSelection();
          });
        }

        envSelect.addEventListener('change', () => {
          const selected = envSelect.options[envSelect.selectedIndex];
          const url = selected.getAttribute('data-url');
          if (url) baseUrlInput.value = url;
        });

        if (featureToggle && featureMenu) {
          featureToggle.addEventListener('click', (event) => {
            event.preventDefault();
            featureMenu.classList.toggle('open');
          });

          featureMenu.addEventListener('change', updateFeatureSelection);

          document.addEventListener('click', (event) => {
            if (!featureFilter) return;
            if (!featureFilter.contains(event.target)) {
              featureMenu.classList.remove('open');
            }
          });

          updateFeatureSelection();
        }

        if (scenarioToggle && scenarioMenu) {
          scenarioToggle.addEventListener('click', (event) => {
            event.preventDefault();
            scenarioMenu.classList.toggle('open');
          });

          scenarioMenu.addEventListener('change', updateScenarioSelection);

          document.addEventListener('click', (event) => {
            if (!scenarioFilter) return;
            if (!scenarioFilter.contains(event.target)) {
              scenarioMenu.classList.remove('open');
            }
          });

          updateScenarioSelection();
        }

        if (scenarioNameList) {
          scenarioNameList.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const button = target.closest('.expand-btn');
            if (!button) return;
            const item = button.closest('.scenario-item');
            if (!item) return;
            const isOpen = item.classList.toggle('open');
            button.textContent = isOpen ? '−' : '+';
            button.title = isOpen ? 'Collapse to hide scenario details' : 'Expand to show scenario details';
          });
        }

        if (scenarioNavButtons.length > 0) {
          scenarioNavButtons.forEach(btn => {
            btn.addEventListener('click', () => {
              scenarioNavButtons.forEach(other => other.classList.remove('active'));
              btn.classList.add('active');
              activeCategoryTag = btn.getAttribute('data-tag') || '';
              updateScenarioVisibility();
              updateRelevantScenarios();
              updateNavHelp();
            });
          });
        }

        function updateNavHelp() {
          if (!navHelp) return;
          navHelp.querySelectorAll('.nav-help-item').forEach(item => {
            const tag = item.getAttribute('data-tag') || '';
            item.classList.toggle('active', tag === (activeCategoryTag || ''));
          });
        }

        if (toggleScenarioDetails && scenarioDetails) {
          toggleScenarioDetails.addEventListener('click', () => {
            const isOpen = scenarioDetails.classList.toggle('open');
            toggleScenarioDetails.textContent = isOpen ? '−' : '+';
            toggleScenarioDetails.title = isOpen ? 'Collapse to hide test configuration' : 'Expand to show test configuration and relevant scenarios';
            if (isOpen) {
              loadLastRunConfig();
            }
          });
        }

        function formatDuration(ms) {
          if (!ms || ms <= 0) return '—';
          const totalSeconds = Math.round(ms / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          return minutes > 0
            ? minutes + 'm ' + String(seconds).padStart(2, '0') + 's'
            : seconds + 's';
        }

        async function loadSummary() {
          const res = await fetch('/report/summary');
          const data = await res.json();
          if (!data.available) {
            document.getElementById('logArea').innerHTML = '<div class="log-item">No report available yet.</div>';
            return;
          }
          document.getElementById('totalCount').textContent = data.totals.total;
          document.getElementById('passedCount').textContent = data.totals.passed;
          document.getElementById('failedCount').textContent = data.totals.failed;
          document.getElementById('skippedCount').textContent = data.totals.skipped;
          document.getElementById('lastUpdated').textContent = data.lastUpdated;
          document.getElementById('runDuration').textContent = formatDuration(data.durationMs);

          const total = Math.max(1, data.totals.total);
          document.getElementById('barTotal').style.height = '100%';
          document.getElementById('barPassed').style.height = (data.totals.passed / total * 100) + '%';
          document.getElementById('barFailed').style.height = (data.totals.failed / total * 100) + '%';
          document.getElementById('barSkipped').style.height = (data.totals.skipped / total * 100) + '%';

          const logArea = document.getElementById('logArea');
          if (data.logs.length === 0) {
            logArea.innerHTML = '<div class="log-item">No logs to display.</div>';
            return;
          }
          logArea.innerHTML = data.logs.map(function(log) {
            const statusColor = log.status === 'failed' ? '#ef4444' : '#6b7280';
            const errorBlock = log.error ? '<div style="color:#b91c1c; white-space:pre-wrap;">' + log.error + '</div>' : '';
            return '<div class="log-item">' +
              '<strong>' + log.scenario + '</strong><br/>' +
              '<span>' + log.step + '</span><br/>' +
              '<span style="color:' + statusColor + '">' + log.status + '</span>' +
              errorBlock +
            '</div>';
          }).join('');
        }

        function updateScenarioHighlight(name) {
          if (!scenarioNameList) return;
          const matchedName = findMatchingScenarioName(name);
          scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
            const itemName = item.getAttribute('data-scenario-name') || '';
            item.classList.toggle('active', itemName === matchedName);
          });
        }

        function updateScenarioStatuses(statusMap, runningName) {
          if (!scenarioNameList) return;
          const matchedRunning = findMatchingScenarioName(runningName);
          scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
            const scenarioName = item.getAttribute('data-scenario-name') || '';
            const statusEl = item.querySelector('.scenario-status');
            if (!statusEl) return;
            let status = statusMap[scenarioName] || forcedStatusMap[scenarioName] || getOutlineStatus(statusMap, scenarioName) || 'unknown';
            if (matchedRunning && scenarioName === matchedRunning) status = 'running';

            statusEl.className = 'scenario-status status-' + status;
            statusEl.textContent = status;
          });
        }

        function getOutlineStatus(statusMap, scenarioName) {
          if (!scenarioName || scenarioName.indexOf('<') === -1 || scenarioName.indexOf('>') === -1) return '';
          const pattern = '^' + scenarioName
            .replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
            .replace(/\\<[^>]+\\>/g, '.+') + '$';
          const regex = new RegExp(pattern);
          const matches = Object.keys(statusMap).filter(name => regex.test(name));
          if (matches.length === 0) return '';

          let hasFailed = false;
          let hasSkipped = false;
          let hasPassed = false;

          matches.forEach(name => {
            const status = statusMap[name];
            if (status === 'failed') hasFailed = true;
            if (status === 'skipped') hasSkipped = true;
            if (status === 'passed') hasPassed = true;
          });

          if (hasFailed) return 'failed';
          if (hasSkipped) return 'skipped';
          if (hasPassed) return 'passed';
          return '';
        }

        function findMatchingScenarioName(name) {
          if (!scenarioNameList) return '';
          const normalized = normalizeScenarioName(name);
          if (!normalized) return '';
          let matchedName = '';
          scenarioNameList.querySelectorAll('.scenario-item').forEach(item => {
            const itemName = item.getAttribute('data-scenario-name') || '';
            if (!matchedName && (itemName === normalized || normalized.startsWith(itemName))) {
              matchedName = itemName;
            }
          });
          return matchedName;
        }

        function normalizeScenarioName(name) {
          if (!name) return '';
          return String(name)
            .replace(/\s+#.*$/, '')
            .replace(/\s+\(Example.*\)$/i, '')
            .trim();
        }

        async function loadRunStatus() {
          try {
            const res = await fetch('/run/status');
            const data = await res.json();
            const display = data.currentScenario || '—';
            if (currentScenario) currentScenario.textContent = display;
            const matchedRunning = findMatchingScenarioName(data.currentScenario || '');
            updateScenarioHighlight(matchedRunning);
            if (matchedRunning && matchedRunning !== lastRunningScenario) {
              if (lastRunningScenario && !lastScenarioStatusMap[lastRunningScenario]) {
                forcedStatusMap[lastRunningScenario] = 'completed';
              }
              lastRunningScenario = matchedRunning;
            }
            updateScenarioStatuses(lastScenarioStatusMap, data.currentScenario || '');
          } catch (e) {
            // Ignore status errors; dashboard should still load.
          }
        }

        async function loadScenarioStatuses() {
          try {
            const res = await fetch('/report/scenarios');
            const data = await res.json();
            if (!data.available) {
              if (runStartedAt && data.reportUpdatedAt && data.reportUpdatedAt < runStartedAt) {
                return;
              }
              return;
            }
            if (runStartedAt && data.reportUpdatedAt && data.reportUpdatedAt < runStartedAt) {
              return;
            }
            lastScenarioStatusMap = data.statusMap || {};
            Object.keys(lastScenarioStatusMap).forEach(name => {
              if (forcedStatusMap[name]) delete forcedStatusMap[name];
            });
            updateScenarioStatuses(lastScenarioStatusMap, data.runningScenario || '');
          } catch (e) {
            // Ignore status errors; dashboard should still load.
          }
        }

        function startScenarioStatusPolling() {
          if (scenarioStatusInterval) clearInterval(scenarioStatusInterval);
          scenarioStatusInterval = setInterval(loadScenarioStatuses, 2000);
          loadScenarioStatuses();
        }

        function stopScenarioStatusPolling() {
          if (!scenarioStatusInterval) return;
          clearInterval(scenarioStatusInterval);
          scenarioStatusInterval = null;
        }

        const statusInterval = setInterval(loadRunStatus, 2000);
        window.addEventListener('beforeunload', () => clearInterval(statusInterval));
        loadRunStatus();


        runForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          runStatus.textContent = 'Running...';
          runBtn.disabled = true;
          lastScenarioStatusMap = {};
          forcedStatusMap = {};
          lastRunningScenario = '';
          runStartedAt = Date.now();
          updateScenarioStatuses({}, '');
          startScenarioStatusPolling();

          const formData = new FormData(runForm);
          featureList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            formData.append('features', cb.value);
          });
          if (scenarioList) {
            scenarioList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
              formData.append('scenarios', cb.value);
            });
          }

          const res = await fetch('/run', {
            method: 'POST',
            body: new URLSearchParams(formData)
          });
          const data = await res.json();
          runStatus.textContent = data.success ? 'Completed' : 'Failed';
          runBtn.disabled = false;
          runStartedAt = 0;
          await loadRunStatus();
          stopScenarioStatusPolling();
          await loadScenarioStatuses();
          await loadSummary();
          await loadLastRunConfig();
          
        });

        loadLastRunConfig();

        // Do not auto-load the last summary on initial page load.
      </script>
    </body>
    </html>
  `);
});

app.post('/run', (req, res) => {
  const { baseUrl, features, tags, scenarioName, scenarios, environment, server } = req.body;
  let selectedFeatures = Array.isArray(features) ? features : features ? [features] : [];
  const scenarioFilters = Array.isArray(scenarios) ? scenarios : scenarios ? [scenarios] : [];

  if (selectedFeatures.length === 0 && (scenarioFilters.length > 0 || tags)) {
    selectedFeatures = getFeatureFiles();
  }
  
  if (selectedFeatures.length === 0) {
    return res.json({ success: false, message: 'No features selected' });
  }
  
  // Set env vars
  process.env.BASE_URL = baseUrl;
  process.env.ENVIRONMENT = environment || '';
  process.env.SERVER = server || '';
  
  // Build args
  const args = [];
  selectedFeatures.forEach(f => {
    args.push(`src/features/${f}.feature`);
  });
  const cleanedScenarioTags = scenarioFilters
    .map(s => String(s).trim())
    .filter(Boolean);

  runState.lastConfig = {
    baseUrl,
    environment: environment || '',
    tags: tags || '',
    scenarioTags: cleanedScenarioTags,
    features: selectedFeatures,
    startedAt: Date.now()
  };

  const tagExpressions = [];
  if (tags) {
    tagExpressions.push(`(${tags})`);
  }
  if (cleanedScenarioTags.length > 0) {
    tagExpressions.push(`(${cleanedScenarioTags.join(' or ')})`);
  }
  if (tagExpressions.length > 0) {
    args.push('--tags', tagExpressions.join(' and '));
  }
  if (scenarioName) {
    args.push('--name', scenarioName);
  }
  
  runState.running = true;
  runState.currentScenario = '';
  runState.startedAt = Date.now();

  // Run the command
  const child = spawn('node', [
    '--loader', 'ts-node/esm', 
    './node_modules/@cucumber/cucumber/bin/cucumber-js',
    '--config', 'cucumber.dashboard.cjs',
    ...args
  ], { cwd: __dirname });
  
  let output = '';
  let outputBuffer = '';
  const handleOutput = (data) => {
    const text = data.toString();
    output += text;
    outputBuffer += text;
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() || '';
    lines.forEach(updateRunStateFromLine);
  };
  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);
  
  child.on('close', (code) => {
    runState.running = false;
    runState.currentScenario = '';
    // Generate excel
    const excelChild = spawn('node', ['generate-excel-report.js'], { cwd: __dirname });
    excelChild.on('close', () => {
      const reportUrl = `/reports/cucumber-report.html?t=${Date.now()}`;
      const trimmedOutput = output.length > 5000 ? output.slice(-5000) : output;
      res.json({
        success: code <= 1,
        reportUrl,
        output: trimmedOutput
      });
    });
  });
});

app.get('/run/status', (req, res) => {
  res.json({
    running: runState.running,
    currentScenario: runState.currentScenario
  });
});

app.get('/run/config', (req, res) => {
  res.json({
    lastConfig: runState.lastConfig,
    running: runState.running,
    currentScenario: runState.currentScenario
  });
});

app.get('/report/summary', (req, res) => {
  const reportPath = path.join(__dirname, 'test-reports', 'cucumber-report.json');
  if (!fs.existsSync(reportPath)) {
    return res.json({ available: false, totals: { total: 0, passed: 0, failed: 0, skipped: 0 }, logs: [] });
  }
  const raw = fs.readFileSync(reportPath, 'utf-8');
  let data = [];
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return res.json({ available: false, totals: { total: 0, passed: 0, failed: 0, skipped: 0 }, logs: [] });
  }

  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  const logs = [];

  data.forEach(feature => {
    const elements = feature.elements || feature.scenarios || [];
    elements.forEach(scenario => {
      total += 1;
      const steps = scenario.steps || [];
      let scenarioStatus = 'passed';
      steps.forEach(step => {
        const status = step.result?.status || 'unknown';
        if (typeof step.result?.duration === 'number') {
          durationMs += step.result.duration / 1_000_000;
        }
        if (status === 'failed') scenarioStatus = 'failed';
        if (status === 'skipped' && scenarioStatus !== 'failed') scenarioStatus = 'skipped';
        if ((status === 'pending' || status === 'undefined') && scenarioStatus === 'passed') scenarioStatus = 'skipped';

        if (status === 'failed') {
          logs.push({
            scenario: scenario.name || 'Unnamed Scenario',
            step: `${step.keyword || ''}${step.name || ''}`.trim(),
            status,
            error: step.result?.error_message || ''
          });
        }
      });
      if (scenarioStatus === 'passed') passed += 1;
      if (scenarioStatus === 'failed') failed += 1;
      if (scenarioStatus === 'skipped') skipped += 1;
    });
  });

  const lastUpdated = fs.statSync(reportPath).mtime.toLocaleString();
  res.json({
    available: true,
    totals: { total, passed, failed, skipped },
    logs: logs.slice(0, 200),
    lastUpdated,
    durationMs: Math.round(durationMs)
  });
});

app.get('/report/scenarios', (req, res) => {
  const reportPath = path.join(__dirname, 'test-reports', 'cucumber-report.json');
  if (!fs.existsSync(reportPath)) {
    return res.json({
      available: false,
      statusMap: {},
      runningScenario: runState.currentScenario,
      running: runState.running,
      startedAt: runState.startedAt,
      reportUpdatedAt: 0,
      stale: false
    });
  }
  const reportStat = fs.statSync(reportPath);
  const reportUpdatedAt = reportStat.mtimeMs;
  const stale = runState.startedAt && reportUpdatedAt < runState.startedAt;
  if (stale) {
    return res.json({
      available: false,
      statusMap: {},
      runningScenario: runState.currentScenario,
      running: runState.running,
      startedAt: runState.startedAt,
      reportUpdatedAt,
      stale: true
    });
  }
  const raw = fs.readFileSync(reportPath, 'utf-8');
  let data = [];
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return res.json({
      available: false,
      statusMap: {},
      runningScenario: runState.currentScenario,
      running: runState.running,
      startedAt: runState.startedAt,
      reportUpdatedAt,
      stale: false
    });
  }

  const statusMap = {};
  data.forEach(feature => {
    const elements = feature.elements || feature.scenarios || [];
    elements.forEach(scenario => {
      const steps = scenario.steps || [];
      let scenarioStatus = 'passed';
      steps.forEach(step => {
        const status = step.result?.status || 'unknown';
        if (status === 'failed') scenarioStatus = 'failed';
        if (status === 'skipped' && scenarioStatus !== 'failed') scenarioStatus = 'skipped';
        if ((status === 'pending' || status === 'undefined') && scenarioStatus === 'passed') scenarioStatus = 'skipped';
      });
      statusMap[scenario.name || 'Unnamed Scenario'] = scenarioStatus;
    });
  });

  res.json({
    available: true,
    statusMap,
    runningScenario: runState.currentScenario,
    running: runState.running,
    startedAt: runState.startedAt,
    reportUpdatedAt,
    stale: false
  });
});

app.get('/report/view', (req, res) => {
  const reportUrl = `/reports/cucumber-report.html?t=${Date.now()}`;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>HTML Report</title>
      <style>
        html, body { height: 100%; margin: 0; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; flex-direction: column; }
        .toolbar { padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
        .content { flex: 1; overflow: auto; }
        .frame { width: 100%; height: 100%; border: 0; display: block; }
      </style>
    </head>
    <body>
      <div class="toolbar">HTML Report</div>
      <div class="content">
        <iframe class="frame" src="${reportUrl}" scrolling="yes"></iframe>
      </div>
    </body>
    </html>
  `);
});

app.get('/download/excel', (req, res) => {
  const reportDir = path.join(__dirname, 'test-reports');
  const files = fs.readdirSync(reportDir).filter(f => f.endsWith('.xlsx'));
  if (files.length > 0) {
    const latest = files
      .map(name => ({
        name,
        mtime: fs.statSync(path.join(reportDir, name)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const downloadName = `cucumber-report-${stamp}.xlsx`;
    res.download(path.join(reportDir, latest.name), downloadName);
  } else {
    res.send('Excel report not found');
  }
});

app.get('/download/html', (req, res) => {
  const filePath = path.join(__dirname, 'test-reports', 'cucumber-report.html');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'cucumber-report.html');
  } else {
    res.send('HTML report not found');
  }
});

app.get('/latest/excel', (req, res) => {
  const reportDir = path.join(__dirname, 'test-reports');
  const files = fs.readdirSync(reportDir).filter(f => f.endsWith('.xlsx'));
  if (files.length === 0) {
    return res.status(404).end();
  }
  const latest = files
    .map(name => ({
      name,
      mtime: fs.statSync(path.join(reportDir, name)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  res.sendFile(path.join(reportDir, latest.name));
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});