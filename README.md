# Family Adventure Book

A playful, responsive family travel scrapbook built with vinext and React. The
first version includes an opening suitcase, interactive trip map, photo stacks,
video postcards, locally saved memory-game stamps, explorer badges, a trip vote,
and an “Add memories” flow.

## Run it

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
node --test tests/rendered-html.test.mjs
```

## Customize the memories

Trip content lives in the `trips` array near the top of `app/page.tsx`. Replace
the sample titles, stories, quotes, statistics, image URLs, video URLs, and quiz
answers there. The explorer cards and future-trip vote are further down in the
same file. The visual system is in `app/globals.css`.

The sample travel imagery and videos are placeholders. Do not publish private
family media at public URLs. Use private object storage and an access policy
before turning this into a shared family archive.

## Photo connections

- **Apple Photos / device:** the working file chooser uses the operating
  system’s protected picker on iPhone, iPad, Mac, Android, and desktop browsers.
  Selected media is previewed for the current browser session only.
- **Google Photos:** the interface explains the intended Google Photos Picker
  API flow. A production connection still needs a Google Cloud OAuth client,
  the Picker API enabled, a server-side token exchange, and private storage for
  imported files.
- **Automatic iCloud Photos sync:** this is not available to a normal website.
  Broad library access would require a native iOS/macOS companion using
  PhotoKit and explicit user permission.

## Storage and privacy

`.openai/hosting.json` currently leaves D1 and R2 disabled because this version
does not upload or persist private media. Enable private storage only when the
family access model and deletion controls are defined.
