# Accounts, sync and sharing

Accounts are optional. Without one, the editor saves the layout in the browser and works
exactly as before. With one, layouts follow you between devices, keep named versions and can
be shared with a read-only link.

## How it fits together

```
editor ── saves first ──> this device (IndexedDB)
   │
   └── SyncEngine ── a moment later ──> account (Supabase: Postgres + Auth)
```

- **The device is the working copy.** Every edit is saved locally first, so the editor never
  waits for the network and works offline. `apps/web/src/cloud/sync.ts` pushes changes up
  about 1.5 seconds after editing stops.
- **No silent overwrites.** Each save names the cloud revision it is based on. If the layout
  changed on another device in the meantime, the database refuses the save and the editor asks
  which copy to keep ("Keep mine" or "Use the other copy"). Nothing is merged.
- **Coming back to a tab checks for news.** On focus, when the tab becomes visible and when
  the connection returns, the editor checks the account. A newer copy with no local changes
  simply replaces the one on screen.
- **A fresh device opens the latest layout.** Signing in on a device that only has the
  untouched starter layout opens the account's most recent layout instead of uploading the
  starter.
- **Versions** are immutable snapshots. Restoring one is a normal edit: it can be undone, and
  it syncs like any other change.
- **Share links** are read-only. The link carries a random 43-character token after `#`, so
  it never reaches server logs. Only its SHA-256 hash is stored. Anyone with the link sees the
  latest saved copy; they can try changes in their browser, but nothing they do is saved
  unless they choose "Make a copy", which becomes their own layout. Stopping sharing (or
  making a new link) makes old links stop working.

The editor only knows the `CloudBackend` interface in `apps/web/src/cloud/backend.ts`.
`supabaseBackend.ts` implements it for production. Tests use `memoryCloud.ts`, an in-memory
service with the same rules, so unit tests and end-to-end tests never touch a real project.

## Database

The schema is in [`supabase/migrations`](../supabase/migrations):

| Table             | Holds                                                    |
| ----------------- | -------------------------------------------------------- |
| `designs`         | One row per layout: the design document and its revision |
| `design_versions` | Named, immutable snapshots of a layout                   |
| `share_links`     | Hashes of share tokens, and when each was revoked        |

Every table has row level security and is owner-only. A trigger makes revisions move one
step at a time and stamps `updated_at`. Signed-out visitors cannot read any table; the only
way to read someone else's layout is `get_shared_design(token)`, which returns that one
layout while its link is live. (The Supabase security advisor flags this function because
anyone can call it. That is the point of a share link; it returns nothing without a valid,
unrevoked token.)

[`supabase/tests/rls.sql`](../supabase/tests/rls.sql) checks all of this by acting as two
users and as a signed-out visitor, inside a transaction it rolls back:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

## Setting up your own project

1. Create a Supabase project and apply the migrations in `supabase/migrations` (SQL editor,
   or `supabase db push` with the Supabase CLI).
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the project URL and its
   publishable key (Project Settings, API). Both are public values.
3. In Authentication, URL Configuration, set the Site URL to where the app is served, and add
   every address people sign in from to the Redirect URLs (for local work,
   `http://localhost:5173` and `http://localhost:4173`). A sign-in link only returns to an
   address on that list.
4. Sign-in emails: Supabase's built-in sender only delivers to members of the project's
   Supabase team, a few emails an hour. For real users, set up a custom SMTP sender in
   Authentication, SMTP Settings.

The production build only includes the account code when the two variables are set, and
loads it after the editor is on screen.

## Offline and installing

The production build includes a service worker (`apps/web/sw/service-worker.js`, with its
file list filled in by a small plugin in `vite.config.ts`). After one visit the editor opens
without a connection, including the 3D view and the PDF export. A new release takes over
once every tab of the old one is closed, so an open tab never mixes files from two releases.
`public/manifest.webmanifest` and the icons make it installable; regenerate the icons with
`apps/web/scripts/make-icons.sh`.
