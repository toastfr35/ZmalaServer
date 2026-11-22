// @test S-LLT-069
// @requirements LLR-SRV-CONFIG-026
// @environment portable
// @plan Issue, replace, expire and consume a phone challenge and exercise the device and public HTTP routes.
// @pass Only an authorized local-terminal account can start a check and only the current external HTTPS visit confirms access.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PublicAccessCheck } = require('../../../zmala_server/public-access-check');
const { storeFixture, request, response, context } = require('../../support/server/unit-fixture');
const { createHandler } = require('../../../zmala_server/http/handler');

test('combined HTTP check requires device authentication and an external TLS visit', async (t) => {
  const store = storeFixture(t);

  const previous = process.env.ZMALA_COMBINED_SERVER;
  process.env.ZMALA_COMBINED_SERVER = '1';
  const handler = createHandler(context(store));
  if (previous === undefined) delete process.env.ZMALA_COMBINED_SERVER;
  else process.env.ZMALA_COMBINED_SERVER = previous;
  async function call(path, options) {
    const res = response();
    await handler(request(path, options), res);
    return res;
  }
  const route = '/api/device/server-configuration';
  const device = { authorization: 'Bearer ' + store.value.users.term1.device_token };
  assert.equal((await call(route, {})).status, 403);
  assert.equal(
    (
      await call(route, {
        headers: { authorization: 'Bearer ' + store.value.users.phone1.device_token },
      })
    ).status,
    403,
  );
  assert.equal((await call(route, { headers: device })).json().state, 'unconfigured');
  store.secureCalls = { httpsUrl: 'https://zmala.example' };
  const headers = { host: 'zmala.example' };
  const socket = { encrypted: true, localPort: 8443 };
  const ticket = (
    await call(route, { method: 'POST', headers: { ...headers, ...device }, socket })
  ).json();
  assert.equal(ticket.state, 'waiting');
  assert.ok(ticket.qr);
  const path = new URL(ticket.url).pathname;
  assert.equal((await call(path, { headers, socket })).status, 404);
  const outside = { headers, socket: { ...socket, remoteAddress: '198.51.100.30' } };
  assert.equal((await call(path, outside)).status, 200);
  assert.equal((await call(path, outside)).status, 404);
  assert.equal(
    (await call(route, { headers: { ...headers, ...device }, socket })).json().state,
    'reached',
  );
  assert.equal((await call('/', outside)).status, 403);
});

test('only a current single-use phone challenge confirms access', () => {
  let now = 100;
  const check = new PublicAccessCheck(() => now);
  const origin = 'https://zmala.example';
  const first = check.start(origin);
  const next = check.start(origin);
  assert.equal(check.confirm(first, origin), false);
  assert.equal(check.confirm(next, 'https://other.example'), false);
  assert.equal(check.confirm(next, origin), true);
  assert.equal(check.confirm(next, origin), false);
  assert.equal(check.status(origin).state, 'reached');
  const expired = check.start(origin);
  now += 300001;
  assert.equal(check.confirm(expired, origin), false);
  assert.equal(check.status(origin).state, 'expired');
  assert.equal(check.status('').state, 'unconfigured');
});
