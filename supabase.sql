create table if not exists public.rooms (
  id text primary key,
  name text not null,
  description text not null default '',
  image_url text not null default '',
  external_url text not null default '',
  spotify_playlist_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id text primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  spotify_track_id text not null default '',
  uri text not null default '',
  name text not null,
  artists text not null default '',
  album text not null default '',
  image_url text not null default '',
  duration_ms integer not null default 0,
  position integer not null,
  category text check (category in ('classic', 'keep', 'marginal', 'gone')),
  sorted_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracks_room_position_idx on public.tracks(room_id, position);
create index if not exists tracks_room_category_idx on public.tracks(room_id, category);
