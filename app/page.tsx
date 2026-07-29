"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "classic" | "keep" | "marginal" | "gone";
type Track = {
  id: string;
  name: string;
  artists: string;
  album: string;
  imageUrl: string;
  durationMs: number;
  position: number;
  category: Category | null;
  sortedBy: string;
};

type Room = {
  id: string;
  name: string;
  imageUrl: string;
  externalUrl: string;
};

const categoryMeta: Record<Category, { label: string; emoji: string; hint: string }> = {
  classic: { label: "Classic", emoji: "🏆", hint: "untouchable, canon, no debate" },
  keep: { label: "Keep", emoji: "✅", hint: "belongs on the playlist" },
  marginal: { label: "Marginal", emoji: "🤔", hint: "argue it out live" },
  gone: { label: "Gone", emoji: "🪦", hint: "thank you for your service" },
};

function formatDuration(ms: number) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = `${totalSeconds % 60}`.padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function initialRoom() {
  if (typeof window === "undefined") return "friday-sort";
  return new URLSearchParams(window.location.search).get("room") || "friday-sort";
}

export default function Home() {
  const [roomId, setRoomId] = useState("friday-sort");
  const [room, setRoom] = useState<Room | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [manualTracks, setManualTracks] = useState("");
  const [roomName, setRoomName] = useState("Friday playlist sort");
  const [sorterName, setSorterName] = useState("");
  const [query, setQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setRoomId(initialRoom());
    setSorterName(localStorage.getItem("playlist-sorter-name") ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem("playlist-sorter-name", sorterName);
  }, [sorterName]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/room?room=${encodeURIComponent(roomId)}`);
        const data = await response.json();
        if (!cancelled) {
          setRoom(data.room);
          setTracks(data.tracks ?? []);
        }
      } catch {
        if (!cancelled) setMessage("Could not refresh the room yet.");
      }
    }

    load();
    const interval = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [roomId]);

  const filteredTracks = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return tracks;
    return tracks.filter((track) =>
      [track.name, track.artists, track.album].join(" ").toLowerCase().includes(needle)
    );
  }, [query, tracks]);

  const grouped = useMemo(() => {
    const buckets: Record<Category | "unsorted", Track[]> = {
      unsorted: [],
      classic: [],
      keep: [],
      marginal: [],
      gone: [],
    };
    for (const track of filteredTracks) buckets[track.category ?? "unsorted"].push(track);
    return buckets;
  }, [filteredTracks]);

  const sortedCount = tracks.filter((track) => track.category).length;
  const progress = tracks.length ? Math.round((sortedCount / tracks.length) * 100) : 0;

  async function importPlaylist() {
    setIsImporting(true);
    setMessage("");
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl, manualTracks, roomName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import failed.");

      const nextRoom = data.room.id;
      setRoomId(nextRoom);
      window.history.replaceState(null, "", `?room=${encodeURIComponent(nextRoom)}`);
      setMessage(`Imported ${data.room.trackCount} tracks. The judging chamber is open.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  async function setCategory(trackId: string, category: Category | null) {
    const previous = tracks;
    setTracks((current) =>
      current.map((track) =>
        track.id === trackId ? { ...track, category, sortedBy: sorterName || "Someone" } : track
      )
    );

    try {
      const response = await fetch("/api/tracks/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, trackId, category, sortedBy: sorterName || "Someone" }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Could not save that sort.");
      }
    } catch (error) {
      setTracks(previous);
      setMessage(error instanceof Error ? error.message : "Could not save that sort.");
    }
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1300);
  }

  const TrackCard = ({ track }: { track: Track }) => (
    <article className="track-card">
      <div className="art">
        {track.imageUrl ? <img src={track.imageUrl} alt="" /> : <span>{track.position + 1}</span>}
      </div>
      <div className="track-main">
        <div className="track-title">{track.name}</div>
        <div className="track-subtitle">
          {track.artists || "Unknown artist"}
          {track.album ? ` · ${track.album}` : ""}
        </div>
        <div className="track-meta">
          <span>#{track.position + 1}</span>
          {formatDuration(track.durationMs) ? <span>{formatDuration(track.durationMs)}</span> : null}
          {track.sortedBy ? <span>last moved by {track.sortedBy}</span> : null}
        </div>
      </div>
      <div className="track-actions" aria-label={`Sort ${track.name}`}>
        {(Object.keys(categoryMeta) as Category[]).map((category) => (
          <button
            className={track.category === category ? `active ${category}` : ""}
            key={category}
            onClick={() => setCategory(track.id, category)}
          >
            {categoryMeta[category].emoji}
            <span>{categoryMeta[category].label}</span>
          </button>
        ))}
        {track.category ? <button onClick={() => setCategory(track.id, null)}>Undo</button> : null}
      </div>
    </article>
  );

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Group playlist triage</p>
          <h1>Sort the playlist without losing the room.</h1>
          <p className="lede">
            Import a Spotify playlist, share the link, and sort every song into Classic, Keep,
            Marginal, or Gone. Everyone watching gets updates every few seconds.
          </p>
        </div>
        <div className="hero-card">
          <span className="big-number">{progress}%</span>
          <span>sorted</span>
          <div className="meter" aria-label={`${progress}% sorted`}>
            <div style={{ width: `${progress}%` }} />
          </div>
          <p>{tracks.length ? `${tracks.length} tracks loaded` : "No playlist loaded yet"}</p>
        </div>
      </section>

      <section className="setup-panel">
        <div className="input-grid">
          <label>
            Your name
            <input
              value={sorterName}
              onChange={(event) => setSorterName(event.target.value)}
              placeholder="Conor, Sarah, The Committee..."
            />
          </label>
          <label>
            Spotify playlist URL
            <input
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
            />
          </label>
          <button className="primary" onClick={importPlaylist} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import playlist"}
          </button>
        </div>

        <details>
          <summary>No Spotify credentials yet? Paste one song per line instead.</summary>
          <div className="manual-grid">
            <label>
              Room name
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
            </label>
            <label>
              Tracks
              <textarea
                value={manualTracks}
                onChange={(event) => setManualTracks(event.target.value)}
                placeholder={"Artist - Song title\nAnother Artist - Another Song"}
              />
            </label>
          </div>
        </details>

        {message ? <p className="notice">{message}</p> : null}
      </section>

      {room ? (
        <section className="room-shell">
          <div className="room-header">
            <div className="room-title">
              {room.imageUrl ? <img src={room.imageUrl} alt="" /> : null}
              <div>
                <p className="eyebrow">Live room</p>
                <h2>{room.name}</h2>
                {room.externalUrl ? (
                  <a href={room.externalUrl} target="_blank" rel="noreferrer">
                    Open in Spotify
                  </a>
                ) : null}
              </div>
            </div>
            <div className="share-row">
              <input value={typeof window === "undefined" ? "" : window.location.href} readOnly />
              <button onClick={copyShareLink}>{isCopied ? "Copied" : "Copy link"}</button>
            </div>
          </div>

          <div className="toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search songs, artists, albums..."
            />
            <span>{grouped.unsorted.length} left to sort</span>
          </div>

          <section className="unsorted">
            <div className="section-heading">
              <h3>Unsorted</h3>
              <span>{grouped.unsorted.length}</span>
            </div>
            <div className="track-list">
              {grouped.unsorted.slice(0, 60).map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          </section>

          <section className="boards">
            {(Object.keys(categoryMeta) as Category[]).map((category) => (
              <div className={`board ${category}`} key={category}>
                <div className="section-heading">
                  <div>
                    <h3>
                      {categoryMeta[category].emoji} {categoryMeta[category].label}
                    </h3>
                    <p>{categoryMeta[category].hint}</p>
                  </div>
                  <span>{grouped[category].length}</span>
                </div>
                <div className="mini-list">
                  {grouped[category].map((track) => (
                    <TrackCard key={track.id} track={track} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </section>
      ) : (
        <section className="empty-state">
          <h2>Start with your Spotify playlist link.</h2>
          <p>Once imported, this page becomes the shareable live sorting room for Friday.</p>
        </section>
      )}
    </main>
  );
}
