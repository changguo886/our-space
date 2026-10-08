-- =============================================================
-- Daily Entry Media V1
-- Friends / 朋友圈：一条 daily entry 可带最多 6 张图片或 1 个短视频。
-- 在 Supabase SQL Editor 手动运行。
-- =============================================================

create table if not exists public.daily_entry_media (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.daily_entries(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  media_type  text not null check (media_type in ('image', 'video')),
  section     text not null check (
    section in ('today_tasks', 'today_note', 'tomorrow_plan')
  ),
  storage_path text not null unique,
  mime_type   text,
  size_bytes  bigint,
  sort_order  integer not null default 1000,
  created_at  timestamptz not null default now()
);

alter table public.daily_entry_media
  add column if not exists section text;

update public.daily_entry_media
set section = 'today_tasks'
where section is null;

alter table public.daily_entry_media
  alter column section set not null;

alter table public.daily_entry_media
  drop constraint if exists daily_entry_media_section_check;

alter table public.daily_entry_media
  add constraint daily_entry_media_section_check
  check (
    section in ('today_tasks', 'today_note', 'tomorrow_plan')
  );

create index if not exists daily_entry_media_entry_order_idx
  on public.daily_entry_media (entry_id, section, sort_order, created_at);

alter table public.daily_entry_media enable row level security;

drop policy if exists daily_entry_media_select on public.daily_entry_media;
create policy daily_entry_media_select
  on public.daily_entry_media
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.can_see_entry(entry_id)
  );

drop policy if exists daily_entry_media_insert on public.daily_entry_media;
create policy daily_entry_media_insert
  on public.daily_entry_media
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.daily_entries e
      where e.id = entry_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists daily_entry_media_delete on public.daily_entry_media;
create policy daily_entry_media_delete
  on public.daily_entry_media
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete
  on public.daily_entry_media
  to authenticated;

-- Private Storage bucket.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'daily-media',
  'daily-media',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload only into the current user's top-level folder.
drop policy if exists daily_media_storage_insert on storage.objects;
create policy daily_media_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'daily-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A signed URL may be created only when the current user can see
-- the daily entry linked to this object.
drop policy if exists daily_media_storage_select on storage.objects;
create policy daily_media_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'daily-media'
    and exists (
      select 1
      from public.daily_entry_media m
      where m.storage_path = name
        and (
          m.user_id = auth.uid()
          or public.can_see_entry(m.entry_id)
        )
    )
  );

drop policy if exists daily_media_storage_delete on storage.objects;
create policy daily_media_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'daily-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
