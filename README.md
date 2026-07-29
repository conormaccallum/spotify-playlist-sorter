# Playlist Sorter

A small live webapp for sorting a Spotify playlist into four buckets:

- Classic
- Keep
- Marginal
- Gone

The app stores the shared room in Supabase Postgres, so friends who open the same room link see the same sorted state. The UI refreshes every few seconds.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

For shared state, create `.env.local` with:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

## Verify

```bash
npm run build
npm test
```

## Vercel hosting

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the GitHub repo.
3. Create a free Supabase project.
4. In Supabase, open **SQL Editor** and run the contents of `supabase.sql`.
5. In Vercel, add these Supabase variables in **Settings → Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Add the Spotify variables in **Settings → Environment Variables**:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
7. Deploy with the defaults:
   - Framework preset: Next.js
   - Build command: `npm run build`
   - Install command: `npm install`
   - Output directory: leave blank

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
