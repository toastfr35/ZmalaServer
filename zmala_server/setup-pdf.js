'use strict';
// Payloads match zmala_terminal/common/provisioning.py; PDFs carry private Wi-Fi or enrollment credentials.
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const path = require('node:path');

// @llr LLR-SRV-ENROLL-003
/** @param {import('./types/contracts').JsonObject} update @returns {string} */
function wifiPayload({ ssid, password = '', security = 'WPA', hidden = false }) {
  if (
    typeof ssid !== 'string' ||
    !ssid ||
    Buffer.byteLength(ssid, 'utf8') > 32 ||
    /[\x00-\x1f\x7f]/.test(ssid)
  )
    throw Error('SSID must contain 1–32 UTF-8 bytes without control characters.');
  if ((security !== 'WPA' && security !== 'nopass') || typeof hidden !== 'boolean')
    throw Error('Choose WPA/WPA2/WPA3 or an open network.');
  if (typeof password !== 'string' || /[\x00-\x1f\x7f]/.test(password))
    throw Error('Invalid Wi-Fi password.');
  if (
    security === 'WPA' &&
    !(
      (password.length >= 8 && password.length <= 63 && /^[\x20-\x7e]+$/.test(password)) ||
      /^[a-fA-F0-9]{64}$/.test(password)
    )
  )
    throw Error('Wi-Fi passwords must be 8–63 ASCII characters, or a 64-digit hexadecimal key.');
  if (security === 'nopass' && password) throw Error('Open networks do not have a password.');
  /** @param {string} value */
  const escape = (value) => value.replace(/[\\;,:"]/g, '\\$&');
  const standard = `WIFI:T:${security};S:${escape(ssid)};P:${escape(password)};H:${hidden};;`;
  // The Windows SDK decoder has a 254-byte result and locale conversion.
  // ASCII packaging preserves every UTF-8 SSID without either limitation.
  if (/^[\x00-\x7f]+$/.test(standard) && Buffer.byteLength(standard) <= 254) return standard;
  const name = Buffer.from(ssid, 'utf8'),
    flags = (security === 'WPA' ? 1 : 0) | (hidden ? 2 : 0);
  return (
    'FAMILY-WIFI:1:' +
    Buffer.concat([
      Buffer.from([flags, name.length]),
      name,
      Buffer.from(password, 'utf8'),
    ]).toString('base64url')
  );
}
// @llr LLR-SRV-ENROLL-004
/** @param {import('./types/contracts').Enrollment} bootstrap */
function serverPayload(bootstrap) {
  return JSON.stringify({ type: 'family-call-server', version: 1, ...bootstrap });
}

// @llr LLR-SRV-ENROLL-004
/** @param {import('./types/contracts').Enrollment} bootstrap */
function compactServerPayload({ server_url, device_id, device_token }) {
  const url = new URL(server_url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.origin.length > 512 ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(device_id) ||
    !/^[A-Za-z0-9_-]{20,256}$/.test(device_token)
  )
    throw Error('Invalid terminal enrollment for a compact QR.');

  // Only pack canonical UUIDs and Base64URL tokens so reconstruction is exact.
  const uuid = /^ZM-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(device_id);
  const rawToken = Buffer.from(device_token, 'base64url');
  const binaryToken = rawToken.toString('base64url') === device_token;
  const authority = Buffer.from(url.host, 'ascii');
  const header = Buffer.alloc(3);
  header[0] = (url.protocol === 'https:' ? 1 : 0) | (uuid ? 2 : 0) | (binaryToken ? 4 : 0);
  header.writeUInt16BE(authority.length, 1);
  const id = uuid
    ? Buffer.from(device_id.slice(3).replaceAll('-', ''), 'hex')
    : Buffer.concat([Buffer.from([device_id.length]), Buffer.from(device_id, 'ascii')]);
  const data = Buffer.concat([
    header,
    authority,
    id,
    binaryToken ? rawToken : Buffer.from(device_token, 'ascii'),
  ]);

  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  let text = 'ZMS1:';
  for (let i = 0; i < data.length; i += 2) {
    const pair = i + 1 < data.length;
    const value = pair ? data.readUInt16BE(i) : data[i];
    text += alphabet[value % 45] + alphabet[Math.floor(value / 45) % 45];
    if (pair) text += alphabet[Math.floor(value / (45 * 45))];
  }
  return text;
}
// @llr LLR-SRV-ENROLL-002
/** @param {{kind: 'wifi' | 'server', label: string, payload: string, serverUrl?: string, app?: boolean}} options
 * @returns {Promise<Buffer>} */
async function setupPdf({ kind, label, payload, serverUrl, app = false }) {
  const phone = app && kind === 'server';
  const apk = 'https://github.com/toastfr35/ZmalaApp/releases/latest/download/ZmalaPhone.apk';
  const doc = new PDFDocument({
    size: 'A4',
    layout: phone ? 'portrait' : 'landscape',
    margin: 40,
    info: { Title: `Zmala - ${phone ? 'phone' : kind} setup`, Author: 'Zmala' },
  });
  /** @type {Buffer[]} */
  const chunks = [];
  /** @type {Promise<Buffer>} */
  const result = new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const ink = '#182A32',
    accent = '#226B60',
    muted = '#48565D',
    width = 515.28;
  /** Bounded text prevents long account names/URLs from creating another page.
   * @param {string} value @param {number} x @param {number} y @param {number} w
   * @param {number} size @param {number} height @param {boolean} [bold] */
  function text(value, x, y, w, size, height, bold = false) {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor(ink)
      .text(value, x, y, { width: w, height, ellipsis: true });
  }
  /** Vector modules stay sharp on paper. Never put artwork inside the quiet zone.
   * @param {string} value @param {number} x @param {number} y @param {number} size */
  function qr(value, x, y, size) {
    const code = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const unit = size / (code.modules.size + 8);
    doc.rect(x, y, size, size).fill('#ffffff');
    doc.fillColor('#000000');
    for (let row = 0; row < code.modules.size; row++)
      for (let col = 0; col < code.modules.size; col++)
        if (code.modules.get(row, col))
          doc.rect(x + (col + 4) * unit, y + (row + 4) * unit, unit + 0.015, unit + 0.015);
    doc.fill();
  }
  if (!phone) {
    // One portrait A5 face on the right of landscape A4; fold the blank half behind it.
    // The frame sits outside the content margins and the QR's four-module quiet zone.
    const half = doc.page.width / 2,
      frameInset = (6 * 72) / 25.4,
      margin = (10 * 72) / 25.4,
      left = half + margin,
      faceWidth = half - 2 * margin;
    doc
      .roundedRect(
        half + frameInset,
        frameInset,
        half - 2 * frameInset,
        doc.page.height - 2 * frameInset,
        8,
      )
      .lineWidth(0.9)
      .stroke(accent);
    doc.image(path.join(__dirname, 'assets/zmala-icon-light.png'), left, margin, {
      width: 42,
      height: 42,
    });
    text('Zmala', left + 50, 36, faceWidth - 50, 24, 32, true);
    doc
      .moveTo(left, 84)
      .lineTo(left + faceWidth, 84)
      .lineWidth(2)
      .stroke(accent);
    text(kind === 'wifi' ? 'Wi-Fi' : 'Terminal', left, 101, faceWidth, 25, 34, true);
    text(
      kind === 'wifi' ? 'Scan the Wi-Fi QR code' : 'Scan the server QR code',
      left,
      140,
      faceWidth,
      12,
      20,
    );
    qr(payload, left, 174, faceWidth);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(muted)
      .text('Private setup code', left, 554, { width: faceWidth, align: 'center', height: 14 });
    doc.end();
    return result;
  }
  /** @param {number} n @param {string} title @param {number} y */
  function step(n, title, y) {
    doc.circle(54, y + 10, 14).fill(accent);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text(String(n), 40, y + 5, { width: 28, align: 'center' });
    text(title, 80, y, 475, 19, 28, true);
  }
  // Sparse colour, strong contrast and numbered instructions also work in grayscale.
  doc.moveTo(40, 44).lineTo(555.28, 44).lineWidth(3).stroke(accent);
  doc.image(path.join(__dirname, 'assets/zmala-icon-light.png'), 40, 57, { width: 36, height: 36 });
  text('Zmala', 84, 61, 256, 22, 30, true);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(accent)
    .text('PHONE SETUP', 350, 70, { width: 205, align: 'right' });
  text('A little setup. More connection.', 40, 109, width, 28, 38, true);
  text('Two simple steps to set up your Android phone.', 40, 151, width, 12, 24);
  doc.roundedRect(40, 185, width, 60, 8).lineWidth(0.7).fillAndStroke('#F3F6F5', '#A9B8B4');
  text('YOUR ACCOUNT', 54, 196, 485, 8, 12, true);
  text(label, 54, 212, 485, 16, 24, true);
  step(1, 'Install the app', 269);
  qr(apk, 40, 305, 158);
  text('Scan with your phone camera', 217, 309, 338, 13, 22, true);
  text(
    'Download ZmalaPhone.apk, then open it in Downloads or your file manager. If asked, allow installation from that app, then tap Install.',
    217,
    340,
    338,
    11,
    75,
  );
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(accent)
    .text('Or tap here to download the app', 217, 420, {
      width: 338,
      link: apk,
      underline: true,
    });
  doc.moveTo(40, 480).lineTo(555.28, 480).lineWidth(0.6).stroke('#A9B8B4');
  step(2, 'Connect your account', 499);
  qr(payload, 40, 535, 205);
  text('Scan this code in Zmala Phone', 265, 544, 290, 13, 38, true);
  text(
    'Open Zmala Phone and choose Scan setup QR. Allow camera, microphone and notifications.',
    265,
    589,
    290,
    11,
    53,
  );
  text(
    "Print this page or show it on another screen to scan. If the PDF is on this phone, use the app's QR-image import with a screenshot of this second code.",
    265,
    649,
    290,
    10,
    78,
  );
  if (serverUrl) text(`Server: ${serverUrl}`, 40, 746, width, 9, 15);
  doc.moveTo(40, 770).lineTo(555.28, 770).lineWidth(0.6).stroke('#A9B8B4');
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(muted)
    .text('This code grants access to this account. Keep this page private.', 40, 780, {
      width,
      height: 12,
    });
  doc.text(
    'Print at actual size (100%). Keep the full code and its white border visible.',
    40,
    793,
    { width, height: 10 },
  );
  doc.end();
  return result;
}
module.exports = { wifiPayload, serverPayload, compactServerPayload, setupPdf };
