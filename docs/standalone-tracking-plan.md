# Standalone MangaBaka tracking

Approved design: installed Quire uses a public native MangaBaka OAuth client, PKCE, the system browser, and `app.quire.reader://oauth/mangabaka`. No Quire server is required. Hosted tracking remains server-backed.

Public client ID: `DxIhaNaNpfOUmtUuLuBTKXJsxfbqhUXY`.

- [x] Native Rust authentication: secure random PKCE/state; exact callback validation; expiring, single-use pending authorization; OS credential storage; serialized token refresh; bounded HTTPS requests to fixed provider endpoints. Register native callback and open authorization in the system browser.
- [x] Local tracker: durable links and progress acknowledgements, per-book matches and explicit series linking with overrides preserved; remote progress never decreases; bounded retry after failure; reconnect never silently enables old links for another account.
- [x] UI: reuse existing tracking dialog through a native/hosted adapter; expose actions in installed reader; resume updates when online, foregrounded, or reading progresses.
- [x] Tests: provider request validation, OAuth callback/state/expiry, progress planning, series overrides, failed update retry, and server-free UI. Run formatting, frontend tests/builds, and native Rust checks. Document device-only checks honestly.
- [ ] Device acceptance: install the unsigned IPA with local signing and verify real sign-in, app return, token refresh, and offline reading updates. This cannot be verified on a Windows host.

Credentials and pending OAuth state must never be included in reader backups. Tracking must not copy server implementation code into the MIT reader.
