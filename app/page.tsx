"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

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

function normalizeDuplicatePart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\((remaster(ed)?|mono|stereo|explicit|clean|radio edit).*?\)/gi, "")
    .replace(/\s*-\s*(remaster(ed)?|mono|stereo|explicit|clean|radio edit).*$/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateKey(track: Track) {
  return `${normalizeDuplicatePart(track.name)}::${normalizeDuplicatePart(track.artists)}`;
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
  const [isShuffling, setIsShuffling] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [flyingDecision, setFlyingDecision] = useState<{
    track: Track;
    category: Category;
  } | null>(null);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [dismissedDuplicateKeys, setDismissedDuplicateKeys] = useState<string[]>([]);
  const lastRoomPayloadRef = useRef("");

  useEffect(() => {
    setRoomId(initialRoom());
    setSorterName(localStorage.getItem("playlist-sorter-name") ?? "");
    const spotifyStatus = new URLSearchParams(window.location.search).get("spotify");
    if (spotifyStatus === "connected") {
      setMessage("Spotify connected. Try importing the playlist again.");
    } else if (spotifyStatus) {
      setMessage(`Spotify connection issue: ${spotifyStatus.replaceAll("_", " ")}`);
    }
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
          const nextTracks = data.tracks ?? [];
          const nextPayload = JSON.stringify({ room: data.room, tracks: nextTracks });
          if (nextPayload !== lastRoomPayloadRef.current) {
            lastRoomPayloadRef.current = nextPayload;
            setRoom(data.room);
            setTracks(nextTracks);
          }
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
  const categoryCounts = useMemo(
    () =>
      (Object.keys(categoryMeta) as Category[]).reduce(
        (memo, category) => ({
          ...memo,
          [category]: tracks.filter((track) => track.category === category).length,
        }),
        {} as Record<Category, number>
      ),
    [tracks]
  );
  const allGrouped = useMemo(() => {
    const buckets: Record<Category, Track[]> = {
      classic: [],
      keep: [],
      marginal: [],
      gone: [],
    };
    for (const track of tracks) {
      if (track.category) buckets[track.category].push(track);
    }
    return buckets;
  }, [tracks]);
  const openCategoryTracks = openCategory ? allGrouped[openCategory] : [];
  const duplicateGroups = useMemo(() => {
    const buckets = new Map<string, Track[]>();
    for (const track of tracks) {
      if (track.category === "gone") continue;
      const key = duplicateKey(track);
      if (!key.startsWith("::") && !key.endsWith("::")) {
        buckets.set(key, [...(buckets.get(key) ?? []), track]);
      }
    }

    return [...buckets.entries()]
      .filter(([key, group]) => group.length > 1 && !dismissedDuplicateKeys.includes(key))
      .map(([key, group]) => ({
        key,
        tracks: group.sort((a, b) => a.position - b.position),
      }));
  }, [dismissedDuplicateKeys, tracks]);
  const activeDuplicateGroup = duplicateGroups[0] ?? null;
  const decisionQueue = grouped.unsorted;
  const currentTrack = decisionQueue[0] ?? null;
  const upcomingTracks = decisionQueue.slice(1, 11);

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
      lastRoomPayloadRef.current = "";
      setDismissedDuplicateKeys([]);
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

  function decideCurrent(category: Category) {
    if (activeDuplicateGroup || !currentTrack || flyingDecision) return;
    setFlyingDecision({ track: currentTrack, category });
    window.setTimeout(() => {
      setCategory(currentTrack.id, category);
      setFlyingDecision(null);
    }, 620);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1300);
  }

  async function shuffleQueue() {
    if (tracks.length < 2 || isShuffling) return;
    setIsShuffling(true);
    setMessage("");

    const previous = tracks;
    const shuffled = [...tracks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    const repositioned = shuffled.map((track, position) => ({ ...track, position }));
    setTracks(repositioned);

    try {
      const response = await fetch("/api/tracks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          orderedTrackIds: repositioned.map((track) => track.id),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not shuffle the queue.");
      setMessage("Queue shuffled. The council has been thrown into productive disarray.");
    } catch (error) {
      setTracks(previous);
      setMessage(error instanceof Error ? error.message : "Could not shuffle the queue.");
    } finally {
      setIsShuffling(false);
    }
  }

  async function resetQueue() {
    if (!tracks.some((track) => track.category) || isResetting) return;
    const confirmed = window.confirm(
      "Reset all sorting progress? This will move every song back into the queue."
    );
    if (!confirmed) return;

    setIsResetting(true);
    setMessage("");
    const previous = tracks;
    const resetTracks = tracks.map((track) => ({ ...track, category: null, sortedBy: "" }));
    setTracks(resetTracks);
    setOpenCategory(null);

    try {
      const response = await fetch("/api/tracks/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not reset the queue.");
      setMessage("All songs are back in the queue. Fresh chaos, clean slate.");
    } catch (error) {
      setTracks(previous);
      setMessage(error instanceof Error ? error.message : "Could not reset the queue.");
    } finally {
      setIsResetting(false);
    }
  }

  function moveTrack(trackId: string, value: string) {
    const nextCategory = value === "queue" ? null : (value as Category);
    setCategory(trackId, nextCategory);
  }

  function dismissDuplicateGroup(key: string) {
    setDismissedDuplicateKeys((current) => [...current, key]);
  }

  const SmallTrackCard = ({ track, index }: { track: Track; index?: number }) => (
    <article
      className="queue-card"
      style={{ "--queue-index": index ?? 0 } as CSSProperties}
    >
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
    </article>
  );

  return (
    <main>
      <section className={`hero ${room ? "compact-hero" : ""}`}>
        <div>
          <p className="eyebrow">Group playlist triage</p>
          <h1>Sort the playlist without losing the room.</h1>
          {!room ? (
            <p className="lede">
              Import a Spotify playlist, share the link, and sort every song into Classic, Keep,
              Marginal, or Gone. Everyone watching gets updates every few seconds.
            </p>
          ) : null}
        </div>
        {!room ? (
          <div className="hero-card">
            <span className="hero-card-label">Ready</span>
            <p>Load the playlist, then the sorting room takes over.</p>
          </div>
        ) : null}
      </section>

      {room ? (
        <details className="setup-panel compact-setup">
          <summary>Import / Spotify controls</summary>
          <div className="setup-content">
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
            <div className="connect-row">
              <a href="/api/spotify/login">Connect Spotify</a>
              <span>Needed for collaborative, private, or owned playlist imports.</span>
            </div>
          </div>
          {message ? <p className="notice">{message}</p> : null}
        </details>
      ) : (
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
          <div className="connect-row">
            <a href="/api/spotify/login">Connect Spotify</a>
            <span>Needed for collaborative, private, or owned playlist track imports.</span>
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
      )}

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
            <div className="toolbar-actions">
              <button onClick={shuffleQueue} disabled={isShuffling || tracks.length < 2}>
                {isShuffling ? "Shuffling..." : "Shuffle queue"}
              </button>
              <button
                className="danger-action"
                onClick={resetQueue}
                disabled={isResetting || !tracks.some((track) => track.category)}
              >
                {isResetting ? "Resetting..." : "Reset sorting"}
              </button>
              <span>
                {decisionQueue.length} left to sort · {sortedCount}/{tracks.length} decided ·{" "}
                {duplicateGroups.length} potential{" "}
                {duplicateGroups.length === 1 ? "duplicate" : "duplicates"} identified
              </span>
            </div>
          </div>

          <section className="category-scoreboard" aria-label="Sorted category totals">
            {(Object.keys(categoryMeta) as Category[]).map((category) => (
              <div className="category-slot" key={category}>
                <button
                  type="button"
                  className={`category-box ${category} ${
                    flyingDecision?.category === category ? "receiving" : ""
                  } ${openCategory === category ? "open" : ""}`}
                  onClick={() =>
                    setOpenCategory((current) => (current === category ? null : category))
                  }
                  aria-expanded={openCategory === category}
                  aria-label={`Open ${categoryMeta[category].label} category with ${categoryCounts[category]} songs`}
                >
                  <div>
                    <span className="category-emoji">{categoryMeta[category].emoji}</span>
                    <h3>{categoryMeta[category].label}</h3>
                    <p>{categoryMeta[category].hint}</p>
                  </div>
                  <strong>{categoryCounts[category]}</strong>
                </button>

                {openCategory === category ? (
                  <section
                    className={`category-popout ${category}`}
                    role="dialog"
                    aria-labelledby="category-popout-title"
                  >
                    <div className="modal-header">
                      <div>
                        <p className="eyebrow">Sorted songs</p>
                        <h2 id="category-popout-title">
                          {categoryMeta[category].emoji} {categoryMeta[category].label}
                        </h2>
                        <p>{openCategoryTracks.length} songs currently in this bucket.</p>
                      </div>
                      <button className="modal-close" onClick={() => setOpenCategory(null)}>
                        Close
                      </button>
                    </div>

                    <div className="modal-track-list">
                      {openCategoryTracks.length ? (
                        openCategoryTracks.map((track) => (
                          <article className="modal-track" key={track.id}>
                            <div className="art">
                              {track.imageUrl ? (
                                <img src={track.imageUrl} alt="" />
                              ) : (
                                <span>{track.position + 1}</span>
                              )}
                            </div>
                            <div className="track-main">
                              <div className="track-title">{track.name}</div>
                              <div className="track-subtitle">
                                {track.artists || "Unknown artist"}
                                {track.album ? ` · ${track.album}` : ""}
                              </div>
                              <div className="track-meta">
                                <span>#{track.position + 1}</span>
                                {track.sortedBy ? <span>moved by {track.sortedBy}</span> : null}
                              </div>
                            </div>
                            <label className="move-label">
                              Move to
                              <select
                                value={track.category ?? "queue"}
                                onChange={(event) => moveTrack(track.id, event.target.value)}
                              >
                                <option value="queue">Back to queue</option>
                                {(Object.keys(categoryMeta) as Category[]).map((nextCategory) => (
                                  <option value={nextCategory} key={nextCategory}>
                                    {categoryMeta[nextCategory].label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </article>
                        ))
                      ) : (
                        <div className="modal-empty">
                          <h3>No songs here yet.</h3>
                          <p>Give it a minute. Democracy is messy.</p>
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}
              </div>
            ))}
          </section>

          <section className="decision-stage">
            {activeDuplicateGroup ? (
              <article className="duplicate-card">
                <div className="duplicate-header">
                  <div>
                    <p className="eyebrow">Duplicate check</p>
                    <h3>These look like the same song.</h3>
                    <p>
                      Deal with likely duplicates first. Send the spare to Gone, or keep both if
                      this is a false alarm.
                    </p>
                  </div>
                  <button
                    className="skip-duplicate"
                    onClick={() => dismissDuplicateGroup(activeDuplicateGroup.key)}
                  >
                    Keep both / skip
                  </button>
                </div>

                <div className="duplicate-list">
                  {activeDuplicateGroup.tracks.map((track) => (
                    <article className="duplicate-item" key={track.id}>
                      <div className="decision-art duplicate-art">
                        {track.imageUrl ? (
                          <img src={track.imageUrl} alt="" />
                        ) : (
                          <span>{track.position + 1}</span>
                        )}
                      </div>
                      <div className="track-main">
                        <div className="track-title">{track.name}</div>
                        <div className="track-subtitle">
                          {track.artists || "Unknown artist"}
                          {track.album ? ` · ${track.album}` : ""}
                        </div>
                        <div className="track-meta">
                          <span>#{track.position + 1}</span>
                          {track.category ? (
                            <span>currently {categoryMeta[track.category].label}</span>
                          ) : (
                            <span>currently in queue</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="duplicate-gone"
                        onClick={() => setCategory(track.id, "gone")}
                      >
                        Move this one to Gone
                      </button>
                    </article>
                  ))}
                </div>
              </article>
            ) : currentTrack ? (
              <article
                className={`decision-card ${
                  flyingDecision?.track.id === currentTrack.id
                    ? `fly-${flyingDecision.category}`
                    : ""
                }`}
              >
                <div className="decision-art">
                  {currentTrack.imageUrl ? (
                    <img src={currentTrack.imageUrl} alt="" />
                  ) : (
                    <span>{currentTrack.position + 1}</span>
                  )}
                </div>
                <div className="decision-copy">
                  <p className="eyebrow">Now deciding</p>
                  <h3>{currentTrack.name}</h3>
                  <p>
                    {currentTrack.artists || "Unknown artist"}
                    {currentTrack.album ? ` · ${currentTrack.album}` : ""}
                  </p>
                  <div className="track-meta">
                    <span>#{currentTrack.position + 1}</span>
                    {formatDuration(currentTrack.durationMs) ? (
                      <span>{formatDuration(currentTrack.durationMs)}</span>
                    ) : null}
                  </div>
                </div>
                <div className="decision-actions" aria-label={`Sort ${currentTrack.name}`}>
                  {(Object.keys(categoryMeta) as Category[]).map((category) => (
                    <button
                      className={category}
                      key={category}
                      onClick={() => decideCurrent(category)}
                      disabled={Boolean(flyingDecision)}
                    >
                      <span>{categoryMeta[category].emoji}</span>
                      {categoryMeta[category].label}
                    </button>
                  ))}
                </div>
              </article>
            ) : (
              <div className="decision-complete">
                <h3>All songs have faced the panel.</h3>
                <p>The playlist has survived democracy. Mostly.</p>
              </div>
            )}
          </section>

          <section className="queue-stage">
            <div className="section-heading">
              <div>
                <h3>Coming up next</h3>
                <p>The next 10 songs float up as you decide.</p>
              </div>
              <span>{upcomingTracks.length}</span>
            </div>
            <div className="queue-stack">
              {upcomingTracks.map((track, index) => (
                <SmallTrackCard key={track.id} track={track} index={index} />
              ))}
            </div>
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
