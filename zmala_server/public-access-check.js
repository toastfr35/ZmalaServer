'use strict';
const { randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const { send, readJson } = require('./http/responses');
const { lanAddress } = require('./defaults');

// @llr LLR-SRV-CONFIG-026
class PublicAccessCheck {
  constructor(clock = Date.now) {
    this.clock = clock;
    this.origin = '';
    this.ticket = '';
    this.deadline = 0;
    this.confirmed = 0;
  }
  /** @param {string} origin */
  start(origin) {
    this.origin = origin;
    this.ticket = randomBytes(24).toString('hex');
    this.confirmed = 0;
    this.deadline = this.clock() + 300000;
    return this.ticket;
  }
  /** @param {string} ticket @param {string} origin */
  confirm(ticket, origin) {
    if (
      !ticket ||
      ticket !== this.ticket ||
      origin !== this.origin ||
      this.clock() >= this.deadline
    )
      return false;
    this.confirmed = this.clock();
    this.ticket = '';
    return true;
  }
  /** @param {string} origin */
  status(origin) {
    if (!origin) return { state: 'unconfigured' };
    if (origin !== this.origin) return { state: 'unverified' };
    if (this.confirmed) return { state: 'reached', checked: this.confirmed };
    if (this.clock() >= this.deadline) return { state: 'expired' };
    return { state: 'waiting', url: origin + '/check-access/' + this.ticket };
  }
}

/** @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res @param {URL} url
 * @param {PublicAccessCheck} check @param {import('./types/contracts').StoreInstance} store
 * @param {boolean} authorized @param {boolean} onAdminNetwork */
async function accessRoute(req, res, url, check, store, authorized, onAdminNetwork) {
  const origin = store.secureCalls ? new URL(store.secureCalls.httpsUrl).origin : '';
  if (url.pathname.startsWith('/check-access/')) {
    if (
      req.method !== 'GET' ||
      onAdminNetwork ||
      url.origin !== origin ||
      !check.confirm(url.pathname.slice('/check-access/'.length), origin)
    )
      return send(
        res,
        404,
        'Check unavailable. Use mobile data and scan the latest code on the TV.',
        'text/plain; charset=utf-8',
      );
    return send(
      res,
      200,
      'Your phone reached the Zmala server. Return to the TV to see the result.',
      'text/plain; charset=utf-8',
    );
  }
  if (url.pathname !== '/api/device/server-configuration') return false;
  if (!authorized) return send(res, 403, { error: 'Local terminal enrollment required.' });
  if (req.method !== 'GET' && req.method !== 'POST')
    return send(res, 405, { error: 'Unsupported method.' });
  if (req.method === 'POST') {
    const fields = await readJson(req, 64, true);
    if (Object.keys(fields).length)
      return send(res, 400, { error: 'No check parameters are required.' });
    if (origin) check.start(origin);
  }
  const status = check.status(origin);
  const address = lanAddress();
  const admin =
    address === '127.0.0.1'
      ? ''
      : origin ||
        (process.env.ZMALA_TLS_CERT
          ? 'https://' +
            (process.env.ZMALA_SERVER_NAME || address) +
            ':' +
            (process.env.ZMALA_HTTPS_PORT || 8443)
          : 'http://' + address + ':' + store.value.http_port);
  const target = status.url || admin;
  const qr = target ? await QRCode.toDataURL(target, { width: 232, margin: 4 }) : '';
  return send(res, 200, {
    ...status,
    origin,
    admin,
    qr: qr.split(',')[1] || '',
    first_setup: !store.adminPassword.hash,
  });
}
module.exports = { PublicAccessCheck, accessRoute };
