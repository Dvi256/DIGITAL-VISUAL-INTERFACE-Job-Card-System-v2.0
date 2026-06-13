/*
  DVI Job Card System - Google Apps Script cloud sync

  One-time setup:
  1. Create a Google Sheet named "DVI Job Card Cloud Database".
  2. In the Sheet, open Extensions > Apps Script.
  3. Paste this whole file into Code.gs and save.
  4. Deploy > New deployment > Web app.
  5. Execute as: Me.
  6. Who has access: Anyone with the link.
  7. Copy the Web app URL and paste it into Cloud Sync settings in the job card system.
*/

const SHEET_NAME = 'DVI_CLOUD_DATA';
const CHUNK_SIZE = 45000;

function doGet(e) {
  const action = String((e.parameter && e.parameter.action) || 'ping').toLowerCase();
  let out;
  try {
    if (action === 'load') {
      const state = readState_();
      out = { ok: true, state, updatedAt: getMeta_().updatedAt || 0 };
    } else if (action === 'meta') {
      const meta = getMeta_();
      out = { ok: true, hasState: !!readStateText_(), updatedAt: meta.updatedAt || 0, client: meta.client || '' };
    } else {
      out = { ok: true, message: 'DVI cloud sync ready', updatedAt: getMeta_().updatedAt || 0 };
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return respond_(e, out);
}

function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = String(body.action || 'save').toLowerCase();
    if (action !== 'save') throw new Error('Unsupported action');
    if (!body.state || !Array.isArray(body.state.jobs)) throw new Error('Invalid DVI state payload');
    writeState_(body.state, body.client || '', body.savedAt || Date.now());
    out = { ok: true, updatedAt: body.savedAt || Date.now() };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function respond_(e, obj) {
  const callback = e.parameter && e.parameter.callback;
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(String(callback).replace(/[^\w$]/g, '') + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from inside the Google Sheet that will store DVI data.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['type', 'part', 'value']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeState_(state, client, savedAt) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = sheet_();
    const text = JSON.stringify(state);
    const rows = [['type', 'part', 'value']];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      rows.push(['state', String(i / CHUNK_SIZE), text.slice(i, i + CHUNK_SIZE)]);
    }
    rows.push(['meta', 'updatedAt', String(savedAt)]);
    rows.push(['meta', 'client', String(client || '')]);
    rows.push(['meta', 'chunks', String(rows.length - 1)]);
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

function readState_() {
  const text = readStateText_();
  return text ? JSON.parse(text) : null;
}

function readStateText_() {
  const sheet = sheet_();
  const last = sheet.getLastRow();
  if (last < 2) return '';
  const rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  return rows
    .filter(row => row[0] === 'state')
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(row => row[2])
    .join('');
}

function getMeta_() {
  const sheet = sheet_();
  const last = sheet.getLastRow();
  const meta = {};
  if (last < 2) return meta;
  const rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  rows.forEach(row => {
    if (row[0] === 'meta') meta[row[1]] = row[2];
  });
  return meta;
}
