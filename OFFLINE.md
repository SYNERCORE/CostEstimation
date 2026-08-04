# Using the Cost Estimator offline

The app is a PWA. Everything it needs — React, the Excel/PDF libraries, all
application code — is served from this repository, so after the first load it
never touches the public internet again.

## One-time setup (needs a connection, once per device)

1. Open the app in **Chrome or Edge** while online.
2. Wait for the tabs to fill in. This is when the service worker downloads and
   stores the ~3.4 MB of libraries and code.
3. **Install it**: click the install icon at the right of the address bar
   (or ⋮ → *Cast, save and share* → *Install page as app*).

That is it. The app now opens from the Start menu with no browser bar and works
with the network completely off.

## What works offline

| | Offline |
|---|---|
| Create, edit, save a CE | Yes |
| Scope Library, Masterlist, CE Monitoring | Yes — from the local cache |
| Open an archived CE with all its line items | Yes — from IndexedDB |
| Excel / CE template export, PDF and Word import | Yes |
| Sync to SharePoint, user approval, audit log | No — needs the connection |

CEs saved offline are marked **local only** in *Admin → Offline Storage*. They
are never deleted by any cleanup, and they upload on the next sync.

## Checking on it

*Admin → Offline Storage* shows how many CEs are held, how many exist **only**
in that browser, the storage quota, and when each reference list last synced.
Use **Export full backup** before wiping a machine or reinstalling Windows —
local-only CEs live nowhere else.

## Notes

- **Storage is per browser, per device.** Chrome and Edge do not share it, and
  neither do two different users on the same PC.
- **Do not use Incognito/Private windows.** Everything is discarded on close.
- **"Clear browsing data" with *Cookies and site data* ticked erases the
  archive.** Export a backup first.
- **Updates** are picked up automatically the next time the app is opened with
  a connection. If a release ever seems not to land, Ctrl+Shift+R once.
- The app must be served over **HTTPS** (GitHub Pages is) or from
  `localhost` — service workers are disabled on plain `http://`.

## Fully air-gapped machines

If a PC will never reach GitHub, serve the folder from any local web server —
for example, from a copy of the repository:

```bash
python -m http.server 8787
```

Then open `http://localhost:8787`. No internet is required at any point,
because the libraries ship in `vendor/`.
