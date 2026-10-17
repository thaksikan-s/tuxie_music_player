-- Run this in the SQL editor of the Supabase project you own.
-- All audio stays in a private bucket. Tracks are invisible until an admin
-- explicitly records permission and enables streaming.

create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null default 'Unknown artist',
  album text not null default 'Unknown album',
  duration_seconds double precision,
  track_number text,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  storage_key text not null unique check (
    storage_key <> ''
    and storage_key !~ '(^|/)\.\.?(/|$)'
    and storage_key !~ '^/'
  ),
  artwork_storage_key text,
  content_type text not null,
  rights_verified boolean not null default false,
  streaming_authorized boolean not null default false,
  -- Controls Tuxie's download UI only; it cannot prevent capture of streamed media.
  download_allowed boolean not null default false,
  rights_notes text,
  rights_verified_by uuid references auth.users(id),
  rights_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not streaming_authorized or rights_verified),
  check (not download_allowed or streaming_authorized),
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' ||
      coalesce(artist, '') || ' ' || coalesce(album, ''))
  ) stored
);

create index if not exists songs_search_document_idx
  on public.songs using gin(search_document);
create index if not exists songs_authorized_title_idx
  on public.songs(title) where streaming_authorized and rights_verified;

alter table public.songs enable row level security;
revoke all on table public.songs from anon, authenticated;
grant select on table public.songs to authenticated;

drop policy if exists "Authenticated users read authorized songs"
  on public.songs;
create policy "Authenticated users read authorized songs"
  on public.songs for select to authenticated
  using (rights_verified and streaming_authorized);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music-library',
  'music-library',
  false,
  1073741824,
  array[
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac',
    'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus',
    'audio/x-ms-wma', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users stream authorized music"
  on storage.objects;
create policy "Authenticated users stream authorized music"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'music-library'
    and exists (
      select 1
      from public.songs s
      where s.storage_key = name
        and s.rights_verified
        and s.streaming_authorized
    )
  );

-- No anon access, public buckets, browser uploads, or authenticated writes.
-- The separate local import tool is an administrator-controlled process
-- that uses the service-role secret and prompts for rights confirmation.
