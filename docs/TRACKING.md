# MangaBaka tracking

Installed Quire on Windows and iOS connects directly to MangaBaka. You do not need a Quire server or a Quire account.

## Connect and match

1. Open a book's actions and choose **Tracking**.
2. Choose **Connect MangaBaka**, sign in through the system browser, and return to Quire.
3. Add a tracker, search for the matching novel, and enable **Automatically sync progress** if desired.

Each book can have its own match. A book may optionally use a series match, or you can track a whole series from its actions. Applying a series match keeps existing individual book overrides. Newly imported volumes can be included by saving the series tracker again.

Starting a book can set its MangaBaka state to Reading. Finishing it can advance the configured volume number; completing the entire MangaBaka entry is a separate book-only option. Quire does not infer external chapter numbers from EPUB sections and never lowers recorded volume progress. Ratings, notes, and unrelated fields are left alone. New entries are private.

## Offline reading and accounts

Reading progress is stored locally. While Quire is open and online, it checks for pending tracking updates on foreground, after local changes, and periodically. Failed updates retry after a delay; tracking does not run continuously after you close the app.

Disconnect keeps the book matches and disables automatic updates. Connecting a different MangaBaka account also disables automatic updates until you explicitly enable them, so another account does not receive your existing reading history unexpectedly.

Native links and update acknowledgements are stored separately in `tracking.db`. OAuth access tokens, refresh tokens, and temporary sign-in state stay in the OS credential store. They are not exposed to the reader webview. Reader backup archives currently exclude native tracking links and credentials; reconnect and match books on a restored device.

## OAuth configuration

The installed app uses a public Native App client with Authorization Code + PKCE (S256), without a client secret. Its public client ID is `DxIhaNaNpfOUmtUuLuBTKXJsxfbqhUXY` and its registered callback is:

```text
app.quire.reader://oauth/mangabaka
```

Sign-in requests `openid`, `profile`, library read/write, and offline access with explicit consent. Account identity comes from MangaBaka's OAuth `userinfo` endpoint; the separate library API is used for reading and updating tracking entries.

The native bridge restricts API requests to MangaBaka, validates the callback and single-use state, and refreshes tokens in secure storage. The browser sign-in returns through the registered app protocol, so no localhost listener or hosted callback is needed. Install the Windows package to register the desktop protocol; iOS packages declare the scheme in their application metadata.

Hosted Quire WebUI continues using its server-side OAuth client and server-managed tracking. A plain development browser build does not implement the installed app's native sign-in. Native and hosted matches are currently independent.

Provider contract: [MangaBaka API](https://mangabaka.org/api.json) and [OAuth discovery](https://mangabaka.org/.well-known/openid-configuration). Validate sign-in and returning to the installed app on a physical iPhone when testing a new release; a Windows build cannot verify iOS behavior.
