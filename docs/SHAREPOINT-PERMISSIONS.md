# SharePoint permissions for Requestors

**Why this matters.** The Requestor limits in the app (read-only on other
people's CEs, no editing, no deleting) are enforced in the browser only. Anyone
who can *write* to the SharePoint lists can bypass them with a direct call. The
real boundary is SharePoint. This sets it so a Requestor account **can raise a
request but cannot change anyone else's CE**, whatever the app does.

Lists are named `<prefix>_<Name>`; the default prefix is `SHICCE`
(for example `SHICCE_Monitoring`). Use your own prefix from SP Setup.

## 1. Three SharePoint groups

On the site: Settings (gear) → Site permissions → Advanced permissions
settings → Create Group. Make these, then add people to the one that matches
their role in the app.

| Group | Who | Permission level |
|---|---|---|
| SHIC CE Owners | Owner and Admin accounts | Full Control |
| SHIC CE Estimators | Estimator accounts | **Edit** |
| SHIC CE Requestors | Requestor accounts | **Contribute** |

Estimators need **Edit**, not Contribute: only Edit lets them change a row
someone else created (the request a Requestor raised, for example).

## 2. Per-list settings

For each list below: List settings → **Permissions for this list** →
**Stop Inheriting Permissions**. Remove the site's Members/Visitors entries,
then grant the three groups the level shown. Then List settings →
**Advanced settings** → **Item-level Permissions**:

- *Read access:* **Read all items**
- *Create and Edit access:* **Create items and edit items created by the user**
  (only on the lists marked "own items" below)

| List | Owners | Estimators | Requestors | Item-level setting |
|---|---|---|---|---|
| `Monitoring` | Full | Edit | Contribute | own items |
| `CEs` | Full | Edit | Contribute | own items |
| `AuditLog` | Full | Edit | Contribute | own items |
| `Users` | Full | Edit | Contribute | own items |
| `CE_MP`, `CE_Resources`, `CE_Documents` | Full | Edit | **Read** | not needed |
| `Masterlist`, `SowLib`, `Companies`, `ML_Imports` | Full | Edit | **Read** | not needed |
| `Drafts` | Full | Edit | **Read** | not needed |

What each Requestor action needs, so you can see why:

- **New Request** creates one row in `CEs` and one in `Monitoring` (and may
  attach documents to the `Monitoring` row), and writes a line to `AuditLog`.
  That is *create*, which Contribute allows.
- **Seeing every CE** (the Dashboard and CE Monitoring) is *read*, which every
  group has.
- **Changing a CE they did not raise** needs *edit someone else's item*.
  "Create items and edit items created by the user" removes that for
  Contribute, which is the point.
- **Costing rows** (`CE_MP`, `CE_Resources`) are never written by a Requestor,
  so they are Read only.
- **`Users`:** every account must be able to register itself and change its own
  password, so Requestors keep Contribute with "own items": they can edit their
  own row and nobody else's.

## 3. Check it, as a Requestor

Sign in to the app with a Requestor account, open the browser console
(F12), and run these. Replace `ID` with the Id of any CE row **not** raised by
this account (the `Id` column of `SHICCE_Monitoring`).

```js
// Should WORK: reading everything.
(await spGet(spList('Monitoring'), '', 'Id,Title')).length

// Should FAIL with 403: editing a row somebody else created.
await spPatch(spList('Monitoring'), ID, { Title: 'permission-test' })

// Should FAIL with 403: deleting one.
await spDelete(spList('Monitoring'), ID)

// Should FAIL with 403: writing a costing row.
await spPost(spList('CE_MP'), { Title: 'permission-test' })
```

If the three writes succeed, that list is still inheriting site permissions or
the account is in the Members group. (If the patch does succeed, set the title
back; it only wrote `permission-test`.)

Then confirm New Request still works end to end as the same account. If it now
fails with a 403, the console names the list (`SP 403 on SHICCE_...`): that list
needs Contribute for Requestors. Add it to the table above and tell me, so the
guide stays true.

## 4. Known gap this does not close

`SHICCE_Users` holds each account's password **hash** (`shicHash`). SharePoint
cannot hide one column, so any account that can read the list can read every
hash. They are PBKDF2 hashes, which is decent, but a weak password can still be
guessed offline. Closing it properly means signing in with the Microsoft
account alone and dropping the app password, which is a change to the app, not
a permission. Until then: keep passwords long, and treat Read access on `Users`
as sensitive.
