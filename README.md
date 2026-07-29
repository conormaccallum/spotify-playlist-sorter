# Playlist Sorter

A small live webapp for sorting a Spotify playlist into four buckets:

- Classic
- Keep
- Marginal
- Gone

The app stores the shared room in D1, so friends who open the same room link see the same sorted state. The UI refreshes every few seconds.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verify

```bash
npm run build
npm test
```

## Spotify import

Spotify’s API requires app credentials to read playlist tracks. Set these runtime environment variables before importing a real Spotify playlist:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

If credentials are not configured yet, the app still works with the fallback importer: paste one song per line in the form `Artist - Song title`.

## How Friday works

1. Open the app.
2. Enter your name.
3. Import the group playlist, or use the paste fallback.
4. Copy the room link and send it to friends.
5. Sort tracks into Classic, Keep, Marginal, or Gone.

Everyone sharing the same `?room=...` URL sees the same saved decisions.
