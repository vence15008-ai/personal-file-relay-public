# Personal File Relay: modifications to FileBrowser Quantum

Modified and published independently as Personal File Relay on 2026-11-05. Upstream baseline: [FileBrowser Quantum v2.0.2-stable](https://github.com/gtsteffaniak/filebrowser/tree/v2.0.2-stable). This is not an official upstream release.

The upstream [Apache-2.0 license](LICENSE) and existing attribution remain in place. The original upstream README is retained in [docs/upstream](docs/upstream/README-quantum-v2.0.2-stable.md). WebView2 dependencies retain their separate license and notice files in client packages.

## Changes to existing upstream files

| File | Personal File Relay changes |
| --- | --- |
| `backend/internal/icons/manifest.go` | Relay Web App name, launch path and icon references |
| `frontend/src/components/prompts/Upload.vue` | Initial clipboard/drop items, compact upload presentation and completion behavior |
| `frontend/src/api/resources.js` | Preserve authorization errors from directory probes and return expired uploads to login |
| `frontend/src/api/utils.js` | Handle same-origin protected API 401 responses without redirecting public/login requests |
| `frontend/src/utils/auth.js` | Recheck cookies after foreground / bfcache restoration and handle failed renewal |
| `frontend/src/utils/upload.js` | Stop private upload queue work once the authenticated user has been cleared |
| `frontend/src/components/sidebar/General.vue` | Navigation to the unified relay |
| `frontend/src/router/index.ts` | Authenticated relay route and landing-page integration |
| `frontend/src/store/getters.ts` | Relay route metadata for the application layout |
| `frontend/src/views/Layout.vue` | Compact relay view and native transparent background integration |
| `.gitignore` | Personal runtime, local build and publishing exclusions |
| `README.md` | Project-specific overview, installation paths, scope and provenance |

Prominent modification notices are present in the changed source files. Model fixtures restored from the upstream tag are unchanged; they are not new Personal File Relay assets.

## Added work

- `frontend/src/views/TextRelay.vue`, clipboard utilities and tests: unified files/messages, explicit clipboard actions, text selection, direct file actions and compact layouts.
- Relay PWA helper and manifest tests.
- `desktop/windows`: Windows x64 WinForms/WebView2 client, user-controlled hotkeys, tray/taskbar behavior and portable packaging.
- `deploy`: isolated Windows host installation and service-management scripts.
- Bilingual project documentation, FAQ, dated validation records and synthetic UI screenshots.

## Public client release 0.1.1

The public client package uses generic host-address examples and includes this modification summary. It contains the same tested client executable identified by SHA-256 in RELEASE.json; the host URL is configured by each user, not embedded as a personal server address. No personal runtime database, cookies or file contents are distributed.

## 2026-11-06: remembered browsers and image drag-out

- Changed upstream authentication, JWT session helpers, middleware, router, user claims and SQLite initialization to support opt-in fixed 90-day browser credentials. Short sessions are signed with a revocable device binding. The additive `relay_remembered_devices` table stores credential hashes, never raw secrets. Password/TOTP/MFA changes invalidate prior credentials. Password login and completed passkey MFA can enroll; an existing short admin session alone cannot enroll.
- Changed `frontend/src/api/auth.js`, `utils/auth.js`, `api/utils.js`, `views/Login.vue`, `components/prompts/Totp.vue` and their tests: explicit enrollment, automatic short-session restoration, bounded retries, same-origin request headers and safe transient-error handling.
- Added `frontend/src/components/RememberDevices.vue` and state/web remembered-device modules and security tests: per-user listing and individual revocation. Explicit logout forgets the current browser. No anonymous API/file access was added.
- Updated the Windows client and unified relay: image rows can initiate native Windows FileDrop using a deliberately downloaded file. Dedicated local cache is limited to 256 MiB with 32 MiB per image and timed cleanup. File preparation and cache integrity are tested; cross-application drop compatibility requires real target-app acceptance.
- Updated client documentation. Production and test profiles remain separate; real user credentials, runtime databases and personal host addresses are excluded from publication.

## 2026-11-06: lightweight image preview

- Changed upstream `backend/internal/web/preview.go` and `backend/internal/preview/preview.go`: original-image shortcuts now check actual pixel dimensions, including highly compressed large images. Oversized image entries produced by the older preview cache are regenerated on demand; unrelated cached content is retained.
- Added `frontend/src/components/RelayImagePreview.vue`, `utils/relayImagePreview.js` and regression tests: one authenticated bounded image request, explicit original loading, cancel/release on close, timeout and readable failure/retry states. The relay keeps its route and pauses listing polls while previewing.
- Added synthetic image-bound and old-cache regression tests; updated existing preview tests and relay interaction tests. Original uploaded/downloaded bytes are unchanged.
- Browser and Windows WebView2 checks use isolated accounts and synthetic files. Actual remote-PC rendering of the user's failing file remains a separate acceptance item; no private image was accessed for these tests.

## 2026-11-06: old-client compatibility and scoped start recovery

- Added an explicit capabilities exchange to the relay and Windows bridge. Native image drag is enabled only after the host advertises support; older clients retain ordinary image-row preview.
- Updated `deploy/windows/start.ps1` to verify the existing task belongs to the current installation and retry a stopped, unlaunched relay task through the Task Scheduler API. Saved privileges, startup triggers and power settings are unchanged.
- Added dated compatibility validation. Preview works in both the older public client and current client; cross-application drag delivery remains a manual acceptance item.
