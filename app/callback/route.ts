import { cookies } from "next/headers";

function redirectUri(request: Request) {
  return process.env.SPOTIFY_REDIRECT_URI || new URL("/callback", request.url).toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("spotify_oauth_state")?.value;

  if (error) {
    return Response.redirect(new URL(`/?spotify=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state || state !== expectedState) {
    return Response.redirect(new URL("/?spotify=state_mismatch", request.url));
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(new URL("/?spotify=missing_credentials", request.url));
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(request),
    }),
  });

  if (!response.ok) {
    return Response.redirect(new URL("/?spotify=token_exchange_failed", request.url));
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cookieStore.delete("spotify_oauth_state");
  cookieStore.set("spotify_access_token", token.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: Math.max(60, token.expires_in - 60),
    path: "/",
  });

  return Response.redirect(new URL("/?spotify=connected", request.url));
}
