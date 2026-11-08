// @test S-HLT-036
// @requirements HLR-SRV-HOST-006
// @environment portable
// @plan Exercise developer-access HTTP routes with a controlled backend: reject anonymous reads/writes, expose only sanitized administrator status, reject non-terminal activation and activation without HTTPS, and allow authenticated deactivation. Hardware qualification additionally enables two terminals in sequence, verifies exclusivity, opens a shell from the server subnet, rejects other-subnet access in both IP families, and confirms deactivation closes the existing shell and prevents reconnection.
// @pass Automated assertions establish HTTP authorization and safe responses only. Record hardware shell, firewall and revocation runs separately; this fixture does not prove them.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { httpFixture } = require('../../support/server/http-fixture');
const developer = require('../../../zmala_server/developer-access');

test('developer controls require admin and never expose tunnel credentials', async () => {
  const original = developer.control;
  const calls = [];
  let active = false;
  developer.control = async (action) => {
    calls.push(action);
    if (active)
      return {
        supported: true,
        terminal_id: 'term1',
        connected: true,
        port: 22001,
        operator: { username: 'zmala', password: 'fixture-operator' },
      };
    return { supported: true, terminal_id: null, connected: false, port: 22001 };
  };
  const fixture = await httpFixture();
  try {
    const endpoint = fixture.base + '/api/developer-access';
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', body: '{"terminal_id":null}' })).status,
      401,
    );
    const headers = {
      Authorization: 'Bearer ' + fixture.store.value.admin_token,
      'Content-Type': 'application/json',
    };
    const state = await (await fetch(endpoint, { headers })).json();
    assert.deepEqual(state, { supported: true, terminal_id: null, connected: false, port: 22001 });
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', headers, body: '{"terminal_id":"missing"}' })).status,
      400,
    );
    assert.ok(fixture.store.terminalAccount('term1').device_id);
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', headers, body: '{"terminal_id":"term1"}' })).status,
      400,
    );
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', headers, body: '{"terminal_id":null}' })).status,
      200,
    );
    assert.deepEqual(calls, ['status', 'off']);
    active = true;
    const deviceHeaders = {
      Authorization: 'Bearer ' + fixture.store.value.users.term1.device_token,
    };
    assert.equal((await fetch(endpoint, { headers: deviceHeaders })).status, 401);
    assert.equal(
      (await fetch(fixture.base + '/api/device/developer-operator', { headers: deviceHeaders }))
        .status,
      403,
    );
    const enabled = await fetch(endpoint, { headers });
    assert.equal(enabled.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await enabled.json()).operator, {
      username: 'zmala',
      password: 'fixture-operator',
    });
  } finally {
    developer.control = original;
    await fixture.close();
  }
});
