import { cookies } from "next/headers";

function redirectUri(request: Request) {
  return process.env.SPOTIFY_REDIRECT_URI || new URL("/callback", request.url).toString();
}

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { error: "SPOTIFY_CLIENT_ID is not configured." },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600,
    path: "/",
  });

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "playlist-read-private playlist-read-collaborative");
  authUrl.searchParams.set("redirect_uri", redirectUri(request));
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl);
}
