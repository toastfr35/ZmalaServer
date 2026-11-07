// @test S-LLT-022
// @requirements LLR-SRV-ENROLL-002, LLR-SRV-ENROLL-003, LLR-SRV-ENROLL-004
// @environment portable
// @plan Generate setup payloads and PDF bytes directly; reject invalid Wi-Fi input and decode compact UTF-8 identity.
// Inspect Wi-Fi and Terminal sheets for one A5 face on landscape A4, full-width QR geometry, four-module quiet borders, logo, minimal text and no printed credentials.
// Render both foldable sheets to verify the frame surrounds the A5 content and stays clear of the QR quiet zone.
// App sheets retain two distinct QR payloads and portrait A4 instructions. Long labels/URLs must not create extra pages.
// @pass All payload fields, validation cases and PDF structure assertions must pass; physical print readability remains a system check.

'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { wifiPayload, serverPayload, setupPdf } = require('../../../zmala_server/setup-pdf');
const { inflateSync } = require('node:zlib');
const QRCode = require('../../../zmala_server/node_modules/qrcode');

test('foldable sheets show only branding, scan prompt and privacy note', async (t) => {
  const PDFDocument = require('node:module').createRequire(
    require.resolve('../../../zmala_server/setup-pdf'),
  )('pdfkit');
  const original = PDFDocument.prototype.text;
  const text = [];
  t.mock.method(PDFDocument.prototype, 'text', function (...args) {
    text.push(args[0]);
    return original.apply(this, args);
  });
  const originalImage = PDFDocument.prototype.image;
  const images = [];
  t.mock.method(PDFDocument.prototype, 'image', function (...args) {
    images.push(args);
    return originalImage.apply(this, args);
  });
  for (const [kind, heading, prompt] of [
    ['wifi', 'Wi-Fi', 'Scan the Wi-Fi QR code'],
    ['server', 'Terminal', 'Scan the server QR code'],
  ]) {
    text.length = 0;
    images.length = 0;
    const pdf = await setupPdf({
      kind,
      label: 'Private label that must not print',
      payload: 'private-credentials',
      serverUrl: 'https://private.example.test',
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.deepEqual(text, ['Zmala', heading, prompt, 'Private setup code']);
    assert.equal(images.length, 1);
    assert.match(images[0][0], /zmala-icon-light\.png$/);
    assert.ok(images[0][1] > 841.89 / 2, 'Logo belongs on the printed half');
    assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 841\.89 595\.28\]/);
  }
});

test('Wi-Fi QR escaping, validation and printable PDF', async () => {
  const input = { ssid: 'Cafe;Wi:Fi\\"', password: 'Secret;:\\,"', hidden: true };
  const payload = wifiPayload(input);
  assert.match(payload, /^WIFI:T:WPA;/);
  assert.ok(payload.includes('Cafe\\;Wi\\:Fi\\\\\\"'));
  assert.ok(payload.includes('H:true;;'));
  assert.match(wifiPayload({ ...input, ssid: 'Café 日本語' }), /^FAMILY-WIFI:1:/);
  assert.equal(
    wifiPayload({ ssid: 'Open', security: 'nopass' }),
    'WIFI:T:nopass;S:Open;P:;H:false;;',
  );
  for (const bad of [
    { ssid: '' },
    { ssid: '界'.repeat(11) },
    { ssid: 'Name', password: 'short' },
    { ssid: 'Name', password: '秘密密码' },
    { ssid: 'Name', security: 'nopass', password: 'secret' },
    { ssid: 'a\n', security: 'nopass' },
  ])
    assert.throws(() => wifiPayload(bad));
  for (const [kind, value] of [
    ['wifi', payload],
    [
      'server',
      serverPayload({
        server_url: 'https://calls.example.test',
        device_id: 'terminal',
        device_token: 'a'.repeat(64),
      }),
    ],
  ]) {
    const pdf = await setupPdf({ kind, label: input.ssid, payload: value });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    // PDF byte size says
    // nothing about whether the page and its QR code were actually generated.
    const source = pdf.toString('latin1');
    assert.match(source, /%%EOF\s*$/);
    assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1);
    assert.match(source, /\/MediaBox \[0 0 841\.89 595\.28\]/);
    const streams = [...source.matchAll(/<<(.*?)>>\s*stream\r?\n(.*?)\r?\nendstream/gs)]
      .filter((match) => match[1].includes('/FlateDecode'))
      .map((match) => inflateSync(Buffer.from(match[2], 'latin1')).toString('latin1'));
    const page = streams.find((stream) => stream.includes(' re\n'));
    assert.ok(page, 'Missing QR drawing commands');
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const darkModules = [...qr.modules.data].filter(Boolean).length;
    assert.equal((page.match(/ re\n/g) || []).length, darkModules + 1);
    const rectangles = [...page.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\n/g)].map((m) =>
      m.slice(1).map(Number),
    );
    const [background, ...modules] = rectangles;
    const [x, y, width, height] = background;
    assert.equal(width, height);
    const margin = (10 * 72) / 25.4;
    assert.ok(Math.abs(x - (841.89 / 2 + margin)) < 0.001);
    assert.ok(Math.abs(width - (841.89 / 2 - 2 * margin)) < 0.001);
    assert.ok(y >= margin && y + height <= 595.28 - margin);
    const unit = width / (qr.modules.size + 8);
    assert.ok(Math.abs(Math.min(...modules.map((r) => r[0])) - x - 4 * unit) < 0.001);
    assert.ok(Math.abs(Math.min(...modules.map((r) => r[1])) - y - 4 * unit) < 0.001);
    for (const [left, top, w, h] of modules) {
      assert.ok(left >= x + 4 * unit - 0.001 && top >= y + 4 * unit - 0.001);
      assert.ok(left + w <= x + width - 4 * unit + 0.016);
      assert.ok(top + h <= y + height - 4 * unit + 0.016);
    }
    assert.match(page, /\bBT\b/); // The page also contains the setup instructions.
  }
});

test('app setup includes a clickable APK download and concise installation steps on one page', async (t) => {
  const PDFDocument = require('node:module').createRequire(
    require.resolve('../../../zmala_server/setup-pdf'),
  )('pdfkit');
  const original = PDFDocument.prototype.text,
    lines = [];
  t.mock.method(PDFDocument.prototype, 'text', function (...args) {
    lines.push(args[0]);
    return original.apply(this, args);
  });
  const pdf = await setupPdf({
    kind: 'server',
    app: true,
    label: 'A long fixture account name (phone1)',
    payload: 'private-fixture',
    serverUrl: 'https://calls.example.test',
  });
  const source = pdf.toString('latin1');
  assert.match(source, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.equal((source.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(
    source,
    /\/URI \(https:\/\/github.com\/toastfr35\/ZmalaApp\/releases\/latest\/download\/ZmalaPhone.apk\)/,
  );
  for (const phrase of [
    'Install the app',
    'file manager',
    'tap Install',
    'Scan setup QR',
    'microphone and notifications',
    'another screen',
    'Keep this page private',
  ])
    assert.ok(
      lines.some((line) => line.includes(phrase)),
      phrase,
    );
});
test('enrollment contains versioned QR identity and compact Wi-Fi preserves UTF-8', () => {
  const enrollment = {
    server_url: 'http://192.168.1.81:8080',
    device_id: 'fixture-serial',
    device_token: 'fixture-token',
  };
  assert.deepEqual(JSON.parse(serverPayload(enrollment)), {
    type: 'family-call-server',
    version: 1,
    ...enrollment,
  });
  assert.deepEqual(JSON.parse(serverPayload({ ...enrollment, account_type: 'app' })), {
    type: 'family-call-server',
    version: 1,
    ...enrollment,
    account_type: 'app',
  });
  const input = { ssid: 'Café 日本語', password: 'fixture-password', hidden: true };
  const encoded = wifiPayload(input);
  const bytes = Buffer.from(encoded.split(':')[2], 'base64url');
  assert.equal(bytes[0], 3);
  assert.equal(bytes.subarray(2, 2 + bytes[1]).toString('utf8'), input.ssid);
  assert.equal(bytes.subarray(2 + bytes[1]).toString('utf8'), input.password);
});

test('account sheets separate download and setup codes and tolerate long labels', async (t) => {
  const original = QRCode.create;
  const values = [];
  t.mock.method(QRCode, 'create', function (value, options) {
    values.push(value);
    return original.call(this, value, options);
  });
  const PDFDocument = require('node:module').createRequire(
    require.resolve('../../../zmala_server/setup-pdf'),
  )('pdfkit');
  const originalText = PDFDocument.prototype.text;
  const lines = [];
  t.mock.method(PDFDocument.prototype, 'text', function (...args) {
    lines.push(args[0]);
    return originalText.apply(this, args);
  });
  for (const app of [false, true]) {
    values.length = 0;
    lines.length = 0;
    const payload = serverPayload({
      server_url: 'https://calls.example.test',
      device_id: 'fixture',
      device_token: 'a'.repeat(64),
    });
    const pdf = await setupPdf({
      kind: 'server',
      app,
      label: 'Long account name '.repeat(30),
      payload,
      serverUrl: 'https://example.test/' + 'path/'.repeat(100),
    });
    assert.deepEqual(
      values,
      app
        ? ['https://github.com/toastfr35/ZmalaApp/releases/latest/download/ZmalaPhone.apk', payload]
        : [payload],
    );
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
    if (!app) {
      assert.deepEqual(lines, [
        'Zmala',
        'Terminal',
        'Scan the server QR code',
        'Private setup code',
      ]);
    }
  }
});
