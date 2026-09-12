create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  track_slug text not null default 'tt-assen',
  video_url text,
  duration_sec numeric not null,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  created_at timestamptz not null default now()
);

create table public.raw_frames (
  id bigint generated always as identity primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  frame_index int not null,
  timestamp_sec numeric not null,
  left_boundary_px jsonb not null,
  right_boundary_px jsonb not null,
  tire_left_px jsonb not null,
  tire_right_px jsonb not null,
  seg_confidence numeric not null,
  frame_width int not null,
  frame_height int not null,
  created_at timestamptz not null default now(),
  unique (session_id, frame_index)
);

create table public.boundary_frames (
  session_id uuid references public.sessions(id) on delete cascade,
  frame_index int not null,
  timestamp_sec numeric not null,
  left_boundary jsonb not null,
  right_boundary jsonb not null,
  tire_left jsonb not null,
  tire_right jsonb not null,
  offset_left_px numeric not null,
  offset_right_px numeric not null,
  breached boolean not null,
  primary key (session_id, frame_index)
);

create table public.violations (
  id text primary key,
  session_id uuid references public.sessions(id) on delete cascade,
  timestamp_sec numeric not null,
  turn_number int not null,
  side text not null check (side in ('left','right')),
  offset_px numeric not null,
  confidence numeric not null check (confidence between 0 and 1),
  clip_url text,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default now()
);

create table public.calibration_points (
  session_id uuid references public.sessions(id) on delete cascade,
  turn_number int not null,
  timestamp_sec numeric not null,
  x_pct numeric not null,
  y_pct numeric not null,
  primary key (session_id, turn_number)
);

create index boundary_frames_time_idx on public.boundary_frames (session_id, timestamp_sec);
create index violations_session_time_idx on public.violations (session_id, timestamp_sec);

grant select on public.sessions to anon, authenticated;
grant all on public.sessions to service_role;

grant all on public.raw_frames to service_role;

grant select on public.boundary_frames to anon, authenticated;
grant all on public.boundary_frames to service_role;

grant select, update on public.violations to anon, authenticated;
grant all on public.violations to service_role;

grant select on public.calibration_points to anon, authenticated;
grant all on public.calibration_points to service_role;

alter table public.sessions enable row level security;
alter table public.raw_frames enable row level security;
alter table public.boundary_frames enable row level security;
alter table public.violations enable row level security;
alter table public.calibration_points enable row level security;

create policy "sessions are publicly readable" on public.sessions for select to anon, authenticated using (true);
create policy "boundary frames are publicly readable" on public.boundary_frames for select to anon, authenticated using (true);
create policy "calibration points are publicly readable" on public.calibration_points for select to anon, authenticated using (true);
create policy "violations are publicly readable" on public.violations for select to anon, authenticated using (true);
create policy "violations review status can be updated" on public.violations for update to anon, authenticated using (true) with check (status in ('pending','confirmed','dismissed'));

alter table public.violations replica identity full;
alter table public.boundary_frames replica identity full;
alter publication supabase_realtime add table public.violations;
alter publication supabase_realtime add table public.boundary_frames;

create policy "session videos are readable" on storage.objects for select to anon, authenticated using (bucket_id = 'session-videos');
create policy "session videos can be uploaded" on storage.objects for insert to anon, authenticated with check (bucket_id = 'session-videos');