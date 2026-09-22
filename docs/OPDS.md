# OPDS catalogs

Open **Add books > Browse catalogs**, choose **Add catalog**, and enter an OPDS URL. Quire supports OPDS 1.2 Atom and OPDS 2.0 JSON, navigation, search, facets, pagination, publication details, and covers.

Select a publication and choose a supported format to download it into your library. Browsing never imports books automatically. Imports use the normal format checks and duplicate detection. Downloads show progress and can be cancelled. DRM, borrowing, and indirect acquisition flows are not supported.

## Saved sources and credentials

Catalog names, URLs, and deletions sync when connected to a compatible Quire Server. Conflicting edits can be reviewed in Catalogs. Backups include source metadata but never catalog passwords.

The installed reader fetches catalogs directly and stores supported credentials in the platform credential store. Android currently supports anonymous native catalogs; saving catalog credentials there is unavailable. The hosted WebUI uses the server proxy and encrypted server-side catalog credentials. The standalone browser needs the catalog to allow cross-origin requests; its credentials last only for the current session. Credentials are not sent to a different origin during redirects.

For a private-network catalog through the hosted WebUI, the server administrator must explicitly allow its origin with `QUIRE_OPDS_ALLOWED_ORIGINS`. See the [server OPDS guide](https://github.com/astraldeath/quire-server/blob/main/docs/OPDS.md).

## Use Quire as an OPDS server

Update Quire Server, then open **Account > OPDS access** in the WebUI or the connected server settings in the installed reader. Copy the OPDS 1.2 or 2.0 URL and create a named app password. Use your Quire username and that password in the other reader. Each password is shown once and can be revoked independently.

Feeds contain server-backed books the account can access, with search, recent additions, folders, and series. Hidden and locked books are excluded, including direct cover and download requests. App passwords grant read-only OPDS access, not the general Quire API. External reading progress is not synchronized through OPDS.
