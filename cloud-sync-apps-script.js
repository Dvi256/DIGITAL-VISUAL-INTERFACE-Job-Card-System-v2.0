/*
  DVI Job Card System - Google Apps Script cloud sync
  Cloud owner: dviugandaow@gmail.com only.

  One-time setup:
  1. Sign in as dviugandaow@gmail.com and open the DVI Apps Script project.
  2. Replace everything in Code.gs with this whole file and save.
  3. Deploy > New deployment > Web app.
  4. Execute as: Me.
  5. Who has access: Anyone.
  6. Authorize the permissions when Google asks.
  7. Copy the Web app URL ending in /exec and paste it into Cloud Sync settings.

  The script creates or reuses a Sheet named "DVI Job Card Cloud Database"
  and also keeps a JSON backup file in dviugandaow@gmail.com's Google Drive.
*/

const SPREADSHEET_NAME = 'DVI Job Card Cloud Database';
const SPREADSHEET_ID_KEY = 'DVI_CLOUD_SPREADSHEET_ID';
const SHEET_NAME = 'DVI_CLOUD_DATA';
const CHUNK_SIZE = 45000;
const DRIVE_FOLDER_NAME = 'DVI Job Card Cloud Backups';
const DRIVE_FILE_NAME = 'DVI Job Card System Cloud Data.json';
const DRIVE_FILE_MIME = 'application/json';

function doGet(e) {
  const action = String((e.parameter && e.parameter.action) || 'ping').toLowerCase();
  let out;
  try {
    if (action === 'load') {
      const state = readState_();
      const meta = getMeta_();
      out = { ok: true, state, meta, updatedAt: meta.updatedAt || 0, driveFileUrl: meta.driveFileUrl || '' };
    } else if (action === 'meta') {
      const meta = getMeta_();
      out = { ok: true, hasState: !!readStateText_(), updatedAt: meta.updatedAt || 0, client: meta.client || '', clientName: meta.clientName || '', account: meta.account || '', driveFileId: meta.driveFileId || '', driveFileUrl: meta.driveFileUrl || '' };
    } else {
      const meta = getMeta_();
      out = { ok: true, message: 'DVI Google Drive cloud sync ready', updatedAt: meta.updatedAt || 0, account: meta.account || effectiveEmail_(), driveFileUrl: meta.driveFileUrl || '' };
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
    writeState_(body.state, body.client || '', body.clientName || '', body.savedAt || Date.now());
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

function spreadsheet_() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (err) {}

  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(SPREADSHEET_ID_KEY);
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (err) {
      props.deleteProperty(SPREADSHEET_ID_KEY);
    }
  }

  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType && file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      props.setProperty(SPREADSHEET_ID_KEY, file.getId());
      return SpreadsheetApp.openById(file.getId());
    }
  }

  const ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty(SPREADSHEET_ID_KEY, ss.getId());
  try {
    const folder = driveFolder_(true);
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {}
  return ss;
}

function sheet_() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([['type', 'part', 'value']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeState_(state, client, clientName, savedAt) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = sheet_();
    const text = JSON.stringify(state);
    const drive = writeDriveBackup_(state, client, clientName, savedAt);
    const rows = [['type', 'part', 'value']];
    let chunks = 0;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      rows.push(['state', String(chunks++), text.slice(i, i + CHUNK_SIZE)]);
    }
    rows.push(['meta', 'updatedAt', String(savedAt)]);
    rows.push(['meta', 'client', String(client || '')]);
    rows.push(['meta', 'clientName', String(clientName || '')]);
    rows.push(['meta', 'account', String(effectiveEmail_() || '')]);
    rows.push(['meta', 'driveFileId', drive.id || '']);
    rows.push(['meta', 'driveFileUrl', drive.url || '']);
    rows.push(['meta', 'driveUpdatedAt', String(savedAt)]);
    rows.push(['meta', 'chunks', String(chunks)]);
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

function readState_() {
  const text = readStateText_();
  if (text) return JSON.parse(text);
  return readDriveState_();
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
  if (last >= 2) {
    const rows = sheet.getRange(2, 1, last - 1, 3).getValues();
    rows.forEach(row => {
      if (row[0] === 'meta') meta[row[1]] = row[2];
    });
  }
  if (!meta.account) meta.account = effectiveEmail_();
  if (!meta.driveFileUrl) {
    const file = findDriveBackup_();
    if (file) {
      meta.driveFileId = file.getId();
      meta.driveFileUrl = file.getUrl();
    }
  }
  return meta;
}

function effectiveEmail_() {
  try {
    return Session.getEffectiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function driveFolder_(createIfMissing) {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return createIfMissing ? DriveApp.createFolder(DRIVE_FOLDER_NAME) : null;
}

function findDriveBackup_() {
  const folder = driveFolder_(false);
  if (!folder) return null;
  const files = folder.getFilesByName(DRIVE_FILE_NAME);
  return files.hasNext() ? files.next() : null;
}

function writeDriveBackup_(state, client, clientName, savedAt) {
  const folder = driveFolder_(true);
  let file = findDriveBackup_();
  const payload = {
    app: 'DVI Job Card System',
    savedAt,
    client: String(client || ''),
    clientName: String(clientName || ''),
    account: effectiveEmail_(),
    state
  };
  const text = JSON.stringify(payload, null, 2);
  if (file) {
    file.setContent(text);
  } else {
    file = folder.createFile(DRIVE_FILE_NAME, text, DRIVE_FILE_MIME);
  }
  file.setDescription('DVI Job Card System cloud backup. Last saved: ' + new Date(savedAt).toISOString());
  return { id: file.getId(), url: file.getUrl() };
}

function readDriveState_() {
  const file = findDriveBackup_();
  if (!file) return null;
  const text = file.getBlob().getDataAsString();
  if (!text) return null;
  const payload = JSON.parse(text);
  if (payload && payload.state && Array.isArray(payload.state.jobs)) return payload.state;
  if (payload && Array.isArray(payload.jobs)) return payload;
  return null;
}
