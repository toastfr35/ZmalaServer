// @test S-LLT-066
// @requirements LLR-SRV-MEDIA-016
// @environment portable
// @plan Exercise the live-call route with bounded/delayed streams, a controlled clock and delayed decoding. Check participants, account kinds, sender-only mutations, image revision, the exact 12000 ms lease and stale renewals, global/per-dialog contention, stop/end/revocation races before and after decoding and slot recovery. Retain a dialog across close and a failing relay teardown; assert access revocation and photo release.
// @pass Only current authorized participants retrieve photos; stop, expiry and late work cannot resurrect a share or affect another call. No media operation is invoked.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable, PassThrough } = require('node:stream');
const { callPhotoRoute, MAX_BYTES } = require('../../../zmala_server/call-photo');
const { response, storeFixture } = require('../../support/server/unit-fixture');

function fixture() {
  const users = {
    app: { type: 'app', device_token: 'a' },
    term: { type: 'terminal', device_token: 't' },
    other: { type: 'app', device_token: 'x' },
  };
  const dialog = { peers: [{ user: 'app' }, { user: 'term' }], connected: true };
  const context = {
    store: { enrolledAccount: (id) => users[id] },
    sipServer: { dialogs: new Map([['call', dialog]]) },
  };
  const invoke = async (
    method = 'GET',
    user = 'app',
    query = '',
    bytes = Buffer.from('image'),
    convert = async (b) => b,
  ) => {
    const req = bytes instanceof Readable ? bytes : Readable.from([bytes]);
    req.method = method;
    const res = response();
    await callPhotoRoute(
      req,
      res,
      new URL('http://local/api/call/photo?call_id=call' + query),
      { ...context, deviceId: user },
      convert,
    );
    return res;
  };
  return { users, dialog, context, invoke };
}
test('participants alone see leased photo; only sender mutates; stop invalidates revision', async () => {
  const { invoke, dialog } = fixture();
  await assert.rejects(invoke('GET', 'other'), { status: 403 });
  await assert.rejects(invoke('PUT', 'term'), { status: 403 });
  const status = (await invoke('PUT')).json();
  assert.equal(status.sharing, true);
  const image = await invoke('GET', 'term', '&image=1&revision=' + status.revision);
  assert.equal(image.bytes.toString(), 'image');
  assert.equal(image.headers['Cache-Control'], 'no-store');
  await assert.rejects(invoke('GET', 'term', '&image=1&revision=999'), { status: 404 });
  await invoke('POST', 'app', '&revision=' + status.revision);
  assert.ok(dialog.photoShare.expires > Date.now());
  await invoke('DELETE');
  assert.equal((await invoke()).json().sharing, false);
  await assert.rejects(invoke('GET', 'term', '&image=1&revision=' + status.revision), {
    status: 404,
  });
});
test('expiry, unconnected and terminal-only calls never expose photo', async () => {
  const f = fixture();
  await f.invoke('PUT');
  f.dialog.photoShare.expires = 0;
  assert.equal((await f.invoke()).json().sharing, false);
  f.dialog.connected = false;
  await assert.rejects(f.invoke(), { status: 403 });
  f.dialog.connected = true;
  f.users.app.type = 'terminal';
  await assert.rejects(f.invoke(), { status: 409 });
});
test('stop, call closure and token revocation fence delayed decoding', async () => {
  for (const action of ['stop', 'end', 'revoke', 'revoke-peer']) {
    const f = fixture();
    let resolve, started;
    const ready = new Promise((r) => (started = r));
    const pending = f.invoke('PUT', 'app', '', Buffer.from('image'), () => {
      started();
      return new Promise((r) => (resolve = r));
    });
    await ready;
    if (action === 'stop') await f.invoke('DELETE');
    if (action === 'end') f.context.sipServer.dialogs.clear();
    if (action === 'revoke') f.users.app.device_token = 'changed';
    if (action === 'revoke-peer') f.users.term.device_token = 'changed';
    resolve(Buffer.from('normalized'));
    await assert.rejects(pending, { status: 409 });
    assert.equal(f.dialog.photoShare.bytes, null);
  }
});
test('oversized and failed uploads release the processing slot', async () => {
  const f = fixture();
  await assert.rejects(f.invoke('PUT', 'app', '', Buffer.alloc(MAX_BYTES + 1)), { status: 413 });
  await assert.rejects(
    f.invoke('PUT', 'app', '', Buffer.from('bad'), async () => {
      throw Error('invalid');
    }),
  );
  assert.equal((await f.invoke('PUT')).json().sharing, true);
});

test('uploads cancelled while arriving never start conversion and release their slot', async () => {
  for (const action of ['stop', 'end', 'revoke', 'revoke-peer']) {
    const f = fixture();
    const upload = new PassThrough();
    const pending = f.invoke('PUT', 'app', '', upload, async () => {
      assert.fail('obsolete upload must not start conversion');
    });
    assert.equal(f.dialog.photoShare.uploading, true);
    if (action === 'stop') await f.invoke('DELETE');
    if (action === 'end') f.context.sipServer.dialogs.clear();
    if (action === 'revoke') f.users.app.device_token = 'changed';
    if (action === 'revoke-peer') f.users.term.device_token = 'changed';
    upload.end(Buffer.from('image'));
    await assert.rejects(pending, { status: 409 });
    assert.equal(f.dialog.photoShare.bytes, null);
    assert.equal(f.dialog.photoShare.sender, null);
    assert.equal(f.dialog.photoShare.uploading, false);
    assert.equal((await fixture().invoke('PUT')).json().sharing, true);
  }
});

test('photo lease renews only the active revision and expires at exactly 12000 ms', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const f = fixture();
  const first = (await f.invoke('PUT')).json();
  assert.equal(first.lease_ms, 12000);
  assert.equal(first.remaining_ms, 12000);
  now += 11999;
  const stale = (await f.invoke('POST', 'app', '&revision=999')).json();
  assert.equal(stale.remaining_ms, 1);
  const renewed = (await f.invoke('POST', 'app', '&revision=' + first.revision)).json();
  assert.equal(renewed.remaining_ms, 12000);
  now += 11999;
  assert.equal((await f.invoke()).json().sharing, true);
  now++;
  const expired = (await f.invoke('POST', 'app', '&revision=' + first.revision)).json();
  assert.equal(expired.sharing, false);
  assert.equal(expired.sender, null);
  assert.equal(expired.revision, first.revision + 1);
  assert.equal(expired.remaining_ms, 0);
  await assert.rejects(f.invoke('GET', 'term', '&image=1&revision=' + first.revision), {
    status: 404,
  });
});

test('two global decoder slots reject a third call and recover after a failed conversion', async () => {
  const first = fixture(),
    second = fixture(),
    third = fixture();
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  const started = [Promise.withResolvers(), Promise.withResolvers()];
  const uploads = [first, second].map((f, i) =>
    f.invoke('PUT', 'app', '', Buffer.from('image'), () => {
      started[i].resolve();
      return gates[i].promise;
    }),
  );
  try {
    await Promise.all(started.map((gate) => gate.promise));
    await assert.rejects(first.invoke('PUT'), { status: 429 });
    await assert.rejects(third.invoke('PUT'), { status: 429 });
    const rejected = assert.rejects(uploads[0], /decode failed/);
    gates[0].reject(Error('decode failed'));
    await rejected;
    assert.equal((await third.invoke('PUT')).json().sharing, true);
    gates[1].resolve(Buffer.from('second photo'));
    assert.equal((await uploads[1]).json().sharing, true);
  } finally {
    for (const gate of gates) gate.resolve(Buffer.from('cleanup'));
    await Promise.allSettled(uploads);
  }
});

test('a replacement upload reports no lease until new bytes are published', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = fixture();
  await f.invoke('PUT');
  const upload = new PassThrough();
  const pending = f.invoke('PUT', 'app', '', upload);
  try {
    const status = (await f.invoke()).json();
    assert.equal(status.sharing, false);
    assert.equal(status.remaining_ms, 0);
  } finally {
    upload.end(Buffer.from('replacement'));
    await pending;
  }
});

test('configuration advertises sharing and contact account types', (t) => {
  const store = storeFixture(t);
  assert.equal(store.appConfig('phone1').call_photo_sharing, true);
  assert.equal(store.config('term1').call_photo_sharing, true);
  assert.equal(
    store.appConfig('phone1').contacts.find((c) => c.id === 'term1').account_type,
    'terminal',
  );
});

test('app peers have exclusive sender ownership and can take turns', async () => {
  const f = fixture();
  f.users.term.type = 'app';
  const first = (await f.invoke('PUT')).json();
  assert.equal(first.sender, 'app');
  for (const method of ['PUT', 'POST', 'DELETE'])
    await assert.rejects(f.invoke(method, 'term'), { status: 409 });
  assert.equal((await f.invoke('GET', 'term')).json().sharing, true);
  await f.invoke('DELETE');
  const second = (await f.invoke('PUT', 'term')).json();
  assert.equal(second.sender, 'term');
  await assert.rejects(f.invoke('DELETE', 'app'), { status: 409 });
  await f.invoke('DELETE', 'term');
  assert.equal((await f.invoke()).json().sharing, false);
});
test('competing app upload cannot claim pending decoding', async () => {
  const f = fixture();
  f.users.term.type = 'app';
  let ready, finish;
  const started = new Promise((r) => (ready = r));
  const pending = f.invoke('PUT', 'app', '', Buffer.from('image'), () => {
    ready();
    return new Promise((r) => (finish = r));
  });
  await started;
  await assert.rejects(f.invoke('PUT', 'term'), { status: 409 });
  await f.invoke('DELETE', 'app');
  finish(Buffer.from('image'));
  await assert.rejects(pending, { status: 409 });
  assert.equal((await f.invoke('PUT', 'term')).json().sender, 'term');
});

test('dialog close revokes retained photos even when media cleanup throws', () => {
  const { SipServer } = require('../../../zmala_server/sip-server');
  for (const fail of [false, true]) {
    const dialog = {
      connected: true,
      photoShare: { revision: 4, bytes: Buffer.from('private'), sender: 'app', expires: 999 },
    };
    const owner = {
      dialogs: new Map([['call', dialog]]),
      media: {
        close() {
          if (fail) throw Error('media failed');
        },
      },
    };
    if (fail)
      assert.throws(() => SipServer.prototype.closeDialog.call(owner, 'call'), /media failed/);
    else SipServer.prototype.closeDialog.call(owner, 'call');
    assert.equal(owner.dialogs.size, 0);
    assert.equal(dialog.connected, false);
    assert.equal(dialog.photoShare.bytes, null);
    assert.equal(dialog.photoShare.revision, 5);
    assert.equal(dialog.photoShare.sender, null);
    assert.equal(dialog.photoShare.expires, 0);
  }
});
