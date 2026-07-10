# Family Adventure Book

A private, interactive family scrapbook for remembering trips together. The
current experience includes an opening suitcase, a trip map, photo stacks,
video postcards, memory-game passport stamps, explorer badges, a family vote,
and an add-memories flow.

## Architecture

- **App and hosting:** Next.js App Router, React, and TypeScript on Vercel.
- **Authentication:** Neon Auth, exposed through the Next.js handlers under
  `/api/auth/*` and the UI under `/auth/*`.
- **Authorization:** signing in is not enough to open the scrapbook. The server
  also checks the signed-in email against the active invite allowlist in
  `family_members`, then binds that record to the Neon Auth user ID.
- **Data:** Neon Postgres through the Neon serverless driver and Drizzle ORM.
  Families, members, trips, passport stamps, votes, and memory metadata are
  stored in Postgres.
- **Media:** device selections are previewed in the browser and recorded as
  metadata. Admin-selected Google Photos are copied into private Vercel Blob
  storage, while Neon stores their family-scoped records and access checks.
- **AI organizer:** an admin-only OpenAI vision flow reads capture metadata and
  small 512px working previews, then stores reviewable trip drafts. Trips and
  captions are not published until the family admin approves them.

The interactive client is in `app/adventure-book.tsx`. The server page in
`app/page.tsx` loads the signed-in family member's state, while mutations in
`app/actions.ts` repeat the family authorization check before writing.

## Local development

Requirements:

- Node.js 22.x
- A Vercel project connected to a Neon integration
- Neon Auth enabled for that Neon project

Install and pull the development environment:

```bash
npm ci
npx vercel@latest link
npx vercel@latest env pull .env.local --yes
npm run db:migrate
npm run db:seed
npm run dev
```

Before running the idempotent seed, set `FAMILY_OWNER_EMAIL` in `.env.local` to
the email that should own the book. `FAMILY_OWNER_NAME` is optional. The seed
creates the family, owner invitation, and the four reference trip slugs used by
the memory game. Create the Neon Auth account with that same email. After email
verification, the first authorized request attaches its Auth user ID to the
invited member record. Any other Auth account is denied family access.

## Environment variables

The application reads these variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon Postgres connection used by the app and Drizzle migrations. |
| `NEON_AUTH_BASE_URL` | Neon Auth endpoint for the database branch. |
| `NEON_AUTH_COOKIE_SECRET` | Secret used to protect Auth session cookies; use at least 32 random characters. |
| `FAMILY_OWNER_EMAIL` | Email allowlisted as the initial family owner by `npm run db:seed`. |
| `FAMILY_OWNER_NAME` | Optional display name for the seeded owner. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob credential used to store private permanent copies of selected Google Photos. |
| `GOOGLE_PHOTOS_CLIENT_ID` | Google OAuth 2.0 Web application client ID. |
| `GOOGLE_PHOTOS_CLIENT_SECRET` | Server-only secret for that Google OAuth client. |
| `GOOGLE_PHOTOS_REDIRECT_URI` | Exact OAuth callback URL. Production uses `https://kanedotcom.com/api/photos/google/callback`. |
| `OPENAI_API_KEY` | Server-only OpenAI project key used by the admin memory organizer. |
| `AI_ORGANIZER_MODEL` | Optional organizer model override; defaults to `gpt-5.4`. |

The Vercel/Neon integration may also provide `DATABASE_URL_UNPOOLED`, `PG*`,
`POSTGRES*`, `NEON_PROJECT_ID`, and other managed aliases. They are useful for
tooling but are not read directly by the running application. The owner values
are seed inputs, not runtime authorization shortcuts.

Never commit `.env.local` or copy production secrets into client-side
`NEXT_PUBLIC_*` variables.

## Auth release checklist

The project requires email verification before an invited email can claim a
family profile. Verification uses Neon Auth's numeric OTP flow, which works with
Neon's shared development email provider. Before inviting the wider family:

1. Add the exact production Vercel/custom origin under Neon **Auth →
   Configuration → Domains**.
2. Replace the shared development mailer with a custom SMTP provider for
   reliable verification and password-reset delivery.
3. Disable **Allow Localhost** on the production branch when local testing no
   longer uses that branch.
4. Keep OAuth, passkeys, Organizations, and MCP auth plugins disabled until
   their production configuration has been reviewed and tested.

## Database changes

Edit `db/schema.ts`, then generate and apply a checked-in migration:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Run migrations against the intended Neon branch before deploying code that
depends on them, then run the idempotent seed on a new or restored database. The
current migration is in `drizzle/0000_wooden_gamora.sql`.

## Validation and deployment

```bash
npm run lint
npm test
npx vercel@latest --prod
```

`npm test` performs a production Next.js build and then runs lightweight source
contracts covering the native Next.js runtime, Neon Auth routing, family-level
authorization, the PostgreSQL schema, and private Google Photos imports.
Configure the database/Auth variables plus Blob and Google OAuth variables in
Vercel before deploying the corresponding features.

## Apple Photos and Google Photos

### Available now

The Add Memories button uses the browser's protected file chooser. On iPhone,
iPad, Mac, Android, and desktop browsers, the operating system can offer the
user's photo library as a source. The user explicitly chooses each photo or
video; the website never receives broad or background access to the library.

### Google Photos

The admin-only flow uses the
[Google Photos Picker API](https://developers.google.com/photos/picker/guides/get-started-picker).
It obtains OAuth consent, creates a picker session, opens Google's secure
picker, polls using Google's recommended interval and timeout, and accepts up
to 500 selected items. The server retrieves and copies one 10-item page per
request, passing opaque page cursors in a POST body so they do not appear in
request URLs. It reports progress to the browser and deletes the Picker session
only after the browser acknowledges the final page with a separate idempotent
finalize request. Each item is copied into private Vercel Blob storage and
recorded in Neon. Capture time, dimensions, camera details, and safe photo/video
metadata are kept for trip grouping. Google strips location EXIF from Picker
downloads, so the site does not claim precise locations from those files. It
never requests broad background library access.

Each page makes one copy attempt per item. If Google, Blob, or Postgres has a
transient failure, the server keeps the Picker session and tells the browser to
retry that same page with backoff. Replayed pages are idempotent, so records
already saved during an interrupted page are reused rather than duplicated.
Unsupported or not-yet-ready selections are reported separately as skipped.

Google Picker `baseUrl` values are authorized, bearer-token-protected download
links that remain available for only about 60 minutes and can expire sooner.
They are used transiently during import and are never stored or logged. The app
therefore cannot reliably stream old memories from Google on demand; permanent
private Blob copies are required for a durable family book.

After a successful admin import, the organizer automatically prepares private
trip drafts. It uses capture-time gaps as the strongest signal and visible scene
similarity as supporting evidence. OpenAI request storage is disabled; only
small working previews are sent, and every draft requires admin approval before
it can assign memories or captions to a trip.

The organizer prepares at most 50 unassigned memories per review so the admin
can verify each proposed chapter without sending hundreds of previews in one AI
request. If a larger import leaves more memories queued, approve the current
drafts and run the organizer again for the next private batch.

Google Cloud and Vercel still need matching credentials before the button can
connect:

1. Create or select a Google Cloud project and enable **Google Photos Picker
   API**.
2. Configure the OAuth consent screen. While the app is in Testing, add the
   family admin's Google account as a test user.
3. Create an OAuth 2.0 client with application type **Web application**.
4. Add `https://kanedotcom.com` as an authorized JavaScript origin and add
   `https://kanedotcom.com/api/photos/google/callback` as an authorized redirect
   URI. Google requires this redirect to match exactly.
5. Store the client ID and secret in Vercel as `GOOGLE_PHOTOS_CLIENT_ID` and
   `GOOGLE_PHOTOS_CLIENT_SECRET`. Set `GOOGLE_PHOTOS_REDIRECT_URI` to the exact
   callback above. Apply them to Production, then redeploy.

For local development, create a separate Web OAuth client using
`http://localhost:3000/api/photos/google/callback` and place its values only in
`.env.local`. Never commit the client secret. Preview deployments need a stable
preview hostname and their own authorized redirect; do not use arbitrary Vercel
preview URLs for this OAuth flow.

### Apple Photos and iCloud Photos

Apple's broad library API is
[PhotoKit](https://developer.apple.com/documentation/photokit), which is for
native Apple-platform apps rather than a normal website. This web app can use
the system file picker for explicit selections, but it cannot continuously sync
an iCloud Photos library. Album-level or background sync would require a native
iOS/macOS companion app, explicit Photo Library permission, and a secure upload
flow to private storage.

## Privacy notes

- Keep the Vercel deployment and all media storage private to invited family
  members.
- Authorize every read and write with the server-derived family/member ID; do
  not accept a family ID supplied by the browser.
- Store media bytes in private object storage, not Postgres and not public URLs.
- Add deletion, export, retention, and invite-management controls before loading
  irreplaceable family media.
