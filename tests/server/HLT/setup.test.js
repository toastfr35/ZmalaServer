// @test S-HLT-018
// @requirements HLR-SRV-ENROLL-001
// @environment portable
// @plan Generate Wi-Fi/terminal/App enrollment PDFs through authenticated HTTP and inspect payloads; assert valid enrolled account identity, the App download link and absence of persisted Wi-Fi secrets.
// Check compact downloads require admin, accept only terminal accounts and have a distinct filename.
// @pass All named assertion cases must pass; skips and visual/hardware checks are recorded separately.

'use strict';
const { httpFixture } = require('../../support/server/http-fixture');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { compactServerPayload, serverPayload } = require('../../../zmala_server/setup-pdf');
const QRCode = require('../../../zmala_server/node_modules/qrcode');

test('QR PDF endpoints require admin, target enrolled accounts and do not persist Wi-Fi secrets', async (t) => {
  const fixture = await httpFixture();
  const { store, base, directory: dir } = fixture;
  async function req(route, method = 'GET', value, token = store.value.admin_token) {
    return fetch(base + route, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: value ? JSON.stringify(value) : undefined,
    });
  }
  try {
    assert.equal(
      (await req('/api/setup/server.pdf?id=term1', 'GET', undefined, 'wrong')).status,
      401,
    );
    assert.equal(
      (
        await req(
          '/api/setup/server.pdf?id=term1',
          'GET',
          undefined,
          store.value.users.term1.device_token,
        )
      ).status,
      401,
    );
    const appPdf = await req('/api/setup/server.pdf?id=phone1');
    assert.equal(appPdf.status, 200);
    assert.match(
      Buffer.from(await appPdf.arrayBuffer()).toString('latin1'),
      /https:\/\/github\.com\/toastfr35\/ZmalaApp\/releases\/latest\/download\/ZmalaPhone\.apk/,
    );
    const r = await req('/api/setup/server.pdf?id=term1');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), /attachment/);
    assert.equal(
      Buffer.from(await r.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
    const payload = JSON.parse(serverPayload(store.bootstrap('term1')));
    assert.equal(payload.device_token, store.value.users.term1.device_token);
    assert.equal(payload.device_id, store.value.users.term1.device_id);
    assert.equal(payload.type, 'family-call-server');
    assert.equal(payload.version, 1);
    const create = QRCode.create;
    const qr = t.mock.method(QRCode, 'create', (value, options) => create(value, options));
    const compactRoute = '/api/setup/server.pdf?id=term1&format=compact';
    assert.equal((await req(compactRoute, 'GET', undefined, 'wrong')).status, 401);
    const compact = await req(compactRoute);
    assert.equal(compact.status, 200);
    assert.equal(
      compact.headers.get('content-disposition'),
      'attachment; filename="zmalacall-server-term1-compact.pdf"',
    );
    assert.equal(
      Buffer.from(await compact.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
    assert.deepEqual(
      qr.mock.calls.map((call) => call.arguments),
      [[compactServerPayload(store.bootstrap('term1', true)), { errorCorrectionLevel: 'M' }]],
    );
    assert.equal((await req('/api/setup/server.pdf?id=phone1&format=compact')).status, 400);
    const before = JSON.stringify(store.value),
      wifi = await req('/api/setup/wifi.pdf', 'POST', {
        ssid: 'Family Test',
        password: 'QrTestPassword',
      });
    assert.equal(wifi.status, 200);
    assert.equal(JSON.stringify(store.value), before);
    assert.equal(
      fs.readFileSync(path.join(dir, 'terminal.json'), 'utf8').includes('QrTestPassword'),
      false,
    );
    assert.equal(
      (await req('/api/setup/wifi.pdf', 'POST', { ssid: 'Test', password: 'wrong' })).status,
      400,
    );
  } finally {
    await fixture.close();
  }
});
