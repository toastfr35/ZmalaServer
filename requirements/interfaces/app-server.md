# ZmalaApp and ZmalaServer interface

This contract describes the wire behavior shared by the Android app and Pi
server. Use it when implementing or testing either side independently. The
Doorstop items listed below own the normative product requirements. Device and
account identities, credentials, and test deployment addresses in examples must
be disposable.

## Enrollment and authentication

- The administrator generates an App account QR. Its UTF-8 JSON contains
  `type: "family-call-server"`, numeric integer `version: 1`,
  `account_type: "app"`, `server_url`, `device_id` and `device_token`.
  The app rejects QR strings over 8,192 Java characters. It accepts a lowercase
  `http` or `https` origin with a host and optional port 1–65535, no
  userinfo, query or fragment, and an empty or root path. Use HTTPS for the
  secure calling profile. Terminal QR payloads cannot enroll the app.
- The App device ID matches `ZP-[a-fA-F0-9-]{36}` and its opaque bearer
  matches `[A-Za-z0-9_-]{24,128}`. The token binds the enrolled account and
  is also the HMAC key for incoming-call proof and FCM events. Keep the QR,
  bearer, SIP password and TURN credentials private.
- Device HTTP calls target the enrolled origin using
  `Authorization: Bearer <device_token>`. The server derives the acting
  account exclusively from the token. App accounts cannot use terminal
  configuration/control or administrative endpoints.
- JSON requests and responses use UTF-8. The app does not follow redirects
  for enrollment-authenticated requests. The standard connect and read
  timeouts are 6 seconds each. The call-photo read timeout is 15 seconds.

## HTTP routes

Success is HTTP 200 for these routes. The standard app API treats 401 and
403 as revoked or unauthorized access and other non-200 responses as request
failures. Call-photo requests report any non-200 as a photo-operation failure.

| Request | Input | Success and app response limit |
| --- | --- | --- |
| `GET /api/app/config` | App bearer; no body | Full configuration snapshot, 256 KiB |
| `GET /photos/<lowercase hex>.<png\|jpg\|gif>` | Device bearer; use only a path from the contact snapshot | Matching image media type; 2 MiB for PNG/JPEG and 16 MiB for GIF |
| `POST /api/app/callbacks` | App bearer, JSON object `{"to":"<account ID>"}` only, at most 4 KiB | `{"callback":{...}}`, 16 KiB |
| `DELETE /api/app/callbacks/<id>` | App bearer; no body; ID matches `[a-f0-9-]{36}` | `{"ok":true}`, 16 KiB |
| `POST /api/app/push` | App bearer, JSON object `{"token":"<FCM token>"}` or `{"token":null}`, at most 8 KiB | `{"ok":true,"push_enabled":<boolean>}`, 8 KiB |
| `POST /api/app/call/decline` | App bearer, JSON object `{"call_id":"<SIP Call-ID>"}`, at most 8 KiB | `{"ok":true,"push_enabled":<boolean>}`, 8 KiB |
| `GET /api/call/photo?call_id=<id>` | Current connected participant bearer | Share status, 8 KiB |
| `GET /api/call/photo?call_id=<id>&revision=<revision>&image=1` | Current connected participant bearer and exact current revision | `image/jpeg` bytes, 2 MiB |
| `PUT /api/call/photo?call_id=<id>` | App participant bearer; nonempty image body, at most 2 MiB. App sends `Content-Type: image/jpeg`; server decoder also accepts PNG | Normalized image installed, new share status, 8 KiB |
| `POST /api/call/photo?call_id=<id>&revision=<revision>` | Sender App bearer; no body | Current share status, 8 KiB. Renews only the exact active revision |
| `DELETE /api/call/photo?call_id=<id>` | Sender App bearer; no body | Clear current share and return new status, 8 KiB |

Device errors are JSON objects with an `error` string. Common status cases
include 401 for a missing or invalid bearer, 403 for an ineligible account or
denied operation, 400 for invalid input, 413 for oversized bodies, 404 for a
missing portrait or an absent/non-owned callback cancellation ID, and 503
when push calling is unavailable. Sending a decline for a pending call that
is gone or owned by a different recipient is a no-op with the normal success
response. It does not end an established SIP dialog.

The photo path takes the URL-encoded SIP Call-ID, at most 256 characters.
Status includes `revision` (integer), `sharing` (boolean), `sender`
(account ID or null), `lease_ms` and `remaining_ms`. Sharing is scoped to
a connected dialog with at least one App participant. Only an App can send,
renew or stop a share. Expired/stale image revisions return 404, wrong
participants 403, sender conflict or cancellation 409, unsupported method
405 and decoder contention 429. Server normalization and expiry are separate
from the contact portrait store. The lease is 12 seconds. The app normally
renews every 3 seconds and polls while receiving about once a second. Stop,
lease expiry, dialog close or identity replacement ends the shared image.
Failed or delayed photo requests must not alter the SIP dialog or leave stale
images covering video indefinitely.

## Configuration, presence and callbacks

- The server returns integer `schema_version: 1`, `configuration_version`,
  `account_type: "app"`, `device_id`, `display_name`, `call_auth_key`,
  `sip`, and `contacts`. It may also include `secure_calls`. The current
  server advertises `callbacks_enabled`, `push_enabled` and
  `call_photo_sharing` as booleans and provides `callbacks`. The client
  gates those optional features on their flags. The app admits a snapshot
  only if its schema, account type, device ID and call-auth key match the QR
  and its SIP policy and contacts validate.
- `sip` carries `username`, `password`, `domain` and `proxy`. Account
  IDs match `[a-z][a-z0-9_-]{0,30}`. Each contact has a unique valid
  `id`, nonblank `name` (at most 80 Java characters), `sip_uri` equal to
  `sip:<id>@<domain>` and actual boolean `can_call` and `can_receive`.
  An optional `photo` is either empty or a permitted relative image path.
  The app accepts at most 40 contacts. The server includes only contacts
  with a call permission in at least one direction.
- Live `presence` is `available` for reachable, registered SIP,
  `push` for a current wake destination and `offline` otherwise.
  `online` is true for the first two states and is the older compatibility
  field. Presence is a hint, and does not grant permission or guarantee
  call success. Presence and callback state can change at the same
  `configuration_version`; the client normally polls every 10 seconds.
- Callbacks are account-scoped and exposed as pending records with `id`,
  `from`, `to`, `status`, `created_at` and `expires_at` (UTC ISO 8601
  timestamps) and current view details. The server returns an existing
  pending record when the same sender and recipient repeat a request.
  The sender alone can cancel it. The app uses the currently authenticated
  snapshot and permitted contacts to reconcile alerts and UI.
- FCM registration is scoped to the current App enrollment. A token
  matches `[A-Za-z0-9_:-]{20,4096}`; `null` unregisters it. Replacement
  detaches the same token from any other account. The server expires a
  registration after 30 days without renewal and removes invalid
  destinations. The app ordinarily coalesces renewals within an hour.
- FCM data fields are strings `event`, `call_id`, `caller`, `expires`,
  `device_id`, `proof`. Event values are `ring`, `cancel` and
  `callback`. `call_id` is a SIP Call-ID for ring/cancel or the callback
  UUID for callback. The app permits 1–256 characters matching
  `[A-Za-z0-9@._:+/=-]` for this ID. `caller` is the sender account ID.
  `expires` is decimal Unix epoch **milliseconds** as a string. The app
  rejects expired events, expiries more than 90 seconds ahead, mismatched
  device IDs and invalid signatures.
- FCM `proof` is lowercase hex HMAC-SHA256 keyed by the device token over
  the UTF-8 compact JSON array
  `[event, call_id, caller, expires, device_id]` in this order, with each
  element a string and no formatting whitespace. Do not reorder fields or
  change their canonical serialization without matching fixtures on both
  sides. Callback push is a state-change hint. It triggers an authenticated
  refresh, including on cancellation, and does not start SIP, camera or
  microphone. Call push may alert or wake the app, but does not authenticate
  an incoming SIP call.

## SIP, media and recovery

- The app registers via SIP Digest with the provisioned SIP username/password
  and domain. The server challenges REGISTER with 401 and a new INVITE
  with 407 proxy authentication (Digest MD5 in the current wire contract).
  Authorization also requires that the From account match the authenticated
  user, the Request-URI/To identify the same permitted peer, and the call
  pass current state and policy checks. Requests inside an existing dialog
  are tied to its authenticated transport flow and tags.
- Local calling uses `sip:<host>:<port>;transport=udp` without
  `secure_calls`. Secure calling requires HTTPS enrollment, a SIP URI with
  `transport=tls`, and `secure_calls` containing
  `mode: "tls-relay"`, `turn_server` as `host:port`, `turn_realm`,
  `turn_username`, `turn_password` and numeric integer `expires` as
  Unix epoch **seconds**. The wire URI remains `sip:` in both profiles,
  including SIP over TLS. Keep SIP identity domains distinct from
  transport hostnames when configured that way. The app requires
  Android-trusted certificates and name verification, forces ICE with
  TURN over TLS and requires SRTP. No insecure signaling or media fallback
  is attempted for this profile. Treat TURN credentials as opaque.
- The server removes client-supplied `X-Family-Auth` and adds the
  lowercase hex HMAC-SHA256 of `<SIP Call-ID>:<caller-account-id>`,
  keyed with the recipient's device token. The app verifies the proof,
  the SIP caller domain and the contact's receive permission before
  admitting an incoming call. An answer initiated from a notification
  must match the authenticated SIP Call-ID and be within its expiry.
- When push wake is available, the server stages the INVITE and waits
  for a fresh registration for 15–60 seconds according to ring policy.
  It rechecks current identity and permissions before forwarding and
  allocates media only after the wait. Caller CANCEL or recipient decline
  clears the wait, and a signed cancellation dismisses the alert.
  Failure or timeout normally yields SIP 480.
- The server relays negotiated SDP/media for the authenticated dialog.
  Secure SDP is audio/video SRTP with ICE. Renegotiation requires a
  valid offer and preserves the active graph until accepted. Audio/video,
  callback actions and photo sharing are distinct operations.
- Temporary HTTP polling failure keeps established media alive and
  retries while the session is in scope. Revocation or an invalid snapshot
  cannot authorize new calls and invalidates applicable session state.
  New SIP/relay settings wait for an idle core restart. Expired applied
  relay credentials cannot start a new call. Background media and push
  have independent lifetime and permission boundaries.

## Changing this interface

- Preserve methods, paths, success statuses, field names and types, signature
  inputs and units within a wire revision. Optional capabilities use explicit
  flags and keep existing callers working when a field is absent. The app
  currently accepts schema and QR version 1 only. Coordinate a deliberate
  breaking change and a version-negotiation or rollout strategy before either
  peer ships it.
- Use local disposable HTTP/SIP/FCM fixtures in each repository. Verify current
  and previous peer behavior for any compatibility-sensitive change, including
  unknown optional fields, revoked or cross-account credentials, redirects,
  size bounds, expiry, late/reordered events and stale revisions. Keep
  expected wire payloads free of real credentials.
- In ZmalaApp, run `make requirements` and `make phone test-android`.
  Relevant LLT suites under `tests/android/LLT/unit` include
  `EnrollmentTest`, `CallAdmissionTest`, `SecureCallsTest`,
  `RecoveryPolicyTest`, `PushMessageTest`, `CallbackBookTest` and
  `PhotoShareEpochTest`. HLT scenarios under `tests/android/HLT` cover
  enrollment, native calling, background wake, continuity, callbacks,
  remote media and photo sharing. Use `make test-android-device` with a
  selected disposable device for instrumentation.
- In ZmalaServer, run `make requirements` and the relevant LLT/HLT cases.
  Start with `app-accounts.test.js`, `app-callbacks.test.js`,
  `app-enrollment.test.js`, `app-push.test.js`, `callback-push.test.js`,
  `sip-identity.test.js`, `secure-calls.test.js`, `call-photo.test.js`
  and `call-photo-http.test.js`. Before claiming compatibility, record
  the exact paired app/server versions. A fixture or successful APK build
  does not establish physical FCM, audio, video or remote TLS/TURN behavior.

## Doorstop trace

| Area | ZmalaApp | ZmalaServer |
| --- | --- | --- |
| Enrollment and configuration | `HLR-AND-ENROLL-001`, `LLR-AND-ENROLL-002` | `HLR-SRV-APP-001`, `LLR-SRV-APP-002`, `LLR-SRV-APP-003` |
| Presence, portraits and call permissions | `LLR-AND-UI-002`, `LLR-AND-CALL-002` | `LLR-SRV-DIR-030`, `LLR-SRV-DIR-031`, `LLR-SRV-PRESENCE-005` |
| Push calls and callback alerts | `LLR-AND-CALL-004`, `HLR-AND-HISTORY-001`, `LLR-AND-HISTORY-002`, `LLR-AND-HISTORY-003` | `HLR-SRV-APP-004`, `LLR-SRV-APP-005`, `LLR-SRV-CALLBACK-015`, `LLR-SRV-CALLBACK-016`, `LLR-SRV-CALLBACK-020`, `LLR-SRV-CALLBACK-025` |
| SIP admission, media and recovery | `HLR-AND-CALL-001`, `LLR-AND-CALL-002`, `LLR-AND-CALL-006` | `LLR-SRV-CALL-003`, `LLR-SRV-CALL-004`, `LLR-SRV-CALL-005`, `LLR-SRV-CALL-006`, `LLR-SRV-CALL-008`, `LLR-SRV-MEDIA-015` |
| Temporary call photos | `LLR-AND-CALL-007` | `HLR-SRV-MEDIA-008`, `LLR-SRV-MEDIA-016` |
