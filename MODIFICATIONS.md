# Personal File Relay: modifications to FileBrowser Quantum

Modified and published independently as Personal File Relay on 2026-11-05. Upstream baseline: [FileBrowser Quantum v2.0.2-stable](https://github.com/gtsteffaniak/filebrowser/tree/v2.0.2-stable). This is not an official upstream release.

The upstream [Apache-2.0 license](LICENSE) and existing attribution remain in place. The original upstream README is retained in [docs/upstream](docs/upstream/README-quantum-v2.0.2-stable.md). WebView2 dependencies retain their separate license and notice files in client packages.

## Changes to existing upstream files

| File | Personal File Relay changes |
| --- | --- |
| `backend/internal/icons/manifest.go` | Relay Web App name, launch path and icon references |
| `frontend/src/components/prompts/Upload.vue` | Initial clipboard/drop items, compact upload presentation and completion behavior |
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
