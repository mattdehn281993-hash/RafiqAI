-- Rafiq initial schema.
--
-- Shared content (books, lessons, pages, cards, audio) is readable by members of
-- a class that uses the book, and is written only by edge functions (service
-- role) after they check permissions. Personal data (progress, saved words,
-- check-ins) is private to each student. Row-level security enforces both.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ─── Books and their lesson map (from the contents pages) ──────────────────

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text,
  level_ar text,
  level_en text,
  publisher text,
  year text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books on delete cascade,
  position int not null,
  title_ar text,
  title_en text,
  letters text,
  unique (book_id, position)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books on delete cascade,
  unit_id uuid references public.units on delete cascade,
  position int not null, -- order through the whole book
  number_label text,
  title_ar text not null,
  title_en text,
  kind text not null check (kind in ('front_matter', 'letter', 'dialogue', 'language_point', 'review', 'other')),
  focus text,
  start_page int,
  unique (book_id, position)
);
create index on public.lessons (unit_id);

-- ─── Classes, membership and invites ───────────────────────────────────────

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books on delete restrict,
  name text not null,
  current_lesson_id uuid references public.lessons on delete set null, -- "We covered up to here"
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.classes (book_id);
create index on public.classes (current_lesson_id);

create table public.memberships (
  class_id uuid not null references public.classes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'student' check (role in ('student', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index on public.memberships (user_id);

create table public.invites (
  code text primary key default substr(md5(gen_random_uuid()::text), 1, 8),
  class_id uuid not null references public.classes on delete cascade,
  role text not null default 'student' check (role in ('student', 'editor')),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int not null default 30,
  uses int not null default 0
);
create index on public.invites (class_id);

-- ─── Scanned pages and cards ───────────────────────────────────────────────

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books on delete cascade,
  lesson_id uuid references public.lessons on delete set null,
  page_number int,
  page_kind text,
  summary text,
  image_quality text,
  image_quality_note text,
  skipped text,
  model text,
  prompt_version text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  scanned_by uuid references auth.users on delete set null,
  scanned_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index pages_book_page_number on public.pages (book_id, page_number) where page_number is not null;
create index on public.pages (lesson_id);

create table public.audio_files (
  hash text primary key, -- sha256 of voice + model + tts_text
  storage_path text not null,
  voice_id text not null,
  model_id text not null,
  source text not null default 'tts' check (source in ('tts', 'native')),
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books on delete cascade, -- null for built-in course cards
  level int check (level between 1 and 4),                 -- built-in course level
  kind text not null,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  check (book_id is not null or level is not null)
);
create index on public.cards (book_id);

create table public.card_versions (
  card_id uuid not null references public.cards on delete cascade,
  version int not null,
  arabic_printed text not null,
  arabic_full text not null,
  tts_text text not null,
  pronunciation text not null,
  english text not null,
  sound_note text,
  needs_checking boolean not null default false,
  needs_checking_reason text,
  audio_hash text references public.audio_files on delete set null,
  changed_by uuid references auth.users on delete set null,
  reason text, -- why this version exists: 'scanned', 'correction: …'
  created_at timestamptz not null default now(),
  primary key (card_id, version)
);
create index on public.card_versions (audio_hash);

create table public.page_cards (
  page_id uuid not null references public.pages on delete cascade,
  position int not null, -- reading order on the page
  card_id uuid not null references public.cards on delete cascade,
  row_index int,
  col_index int, -- counted from the right
  primary key (page_id, position)
);
create index on public.page_cards (card_id);

-- ─── Personal data ─────────────────────────────────────────────────────────

create table public.progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references public.cards on delete cascade,
  times_practised int not null default 0,
  times_correct int not null default 0,
  last_result text check (last_result in ('correct', 'wrong', 'skipped')),
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index on public.progress (card_id);

create table public.saved_words (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references public.cards on delete cascade,
  lesson_id uuid references public.lessons on delete set null,
  saved_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index on public.saved_words (card_id);
create index on public.saved_words (lesson_id);

create table public.checkins (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id uuid not null references public.lessons on delete cascade,
  checkin_date date not null default current_date,
  answer text not null check (answer in ('yes', 'partly', 'no')),
  primary key (user_id, lesson_id, checkin_date)
);
create index on public.checkins (lesson_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards on delete cascade,
  card_version int not null,
  reporter uuid not null default auth.uid() references auth.users on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users on delete set null,
  resolved_at timestamptz
);
create index on public.reports (card_id);
create index on public.reports (reporter);

-- The current version of every card, with RLS of the underlying tables applied.
create view public.current_cards with (security_invoker = true) as
  select c.id, c.book_id, c.level, c.kind, c.current_version,
         v.arabic_printed, v.arabic_full, v.tts_text, v.pronunciation, v.english,
         v.sound_note, v.needs_checking, v.needs_checking_reason, v.audio_hash, v.created_at as version_created_at
  from public.cards c
  join public.card_versions v on v.card_id = c.id and v.version = c.current_version;

-- ─── Permission helpers (not exposed through the API) ──────────────────────

create function private.is_class_member(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.class_id = p_class and m.user_id = (select auth.uid())
  );
$$;

create function private.is_class_editor(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.class_id = p_class and m.user_id = (select auth.uid()) and m.role = 'editor'
  );
$$;

create function private.can_read_book(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.classes c on c.id = m.class_id
    where c.book_id = p_book and m.user_id = (select auth.uid())
  );
$$;

create function private.is_book_editor(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.classes c on c.id = m.class_id
    where c.book_id = p_book and m.user_id = (select auth.uid()) and m.role = 'editor'
  );
$$;

create function private.can_read_card(p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cards c
    where c.id = p_card and (c.book_id is null or private.can_read_book(c.book_id))
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ─── Row-level security ────────────────────────────────────────────────────

alter table public.books enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.classes enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.pages enable row level security;
alter table public.audio_files enable row level security;
alter table public.cards enable row level security;
alter table public.card_versions enable row level security;
alter table public.page_cards enable row level security;
alter table public.progress enable row level security;
alter table public.saved_words enable row level security;
alter table public.checkins enable row level security;
alter table public.reports enable row level security;

-- Shared content: read-only for members; edge functions write with the service role.
create policy "members read books" on public.books for select to authenticated
  using (private.can_read_book(id));
create policy "members read units" on public.units for select to authenticated
  using (private.can_read_book(book_id));
create policy "members read lessons" on public.lessons for select to authenticated
  using (private.can_read_book(book_id));
create policy "members read pages" on public.pages for select to authenticated
  using (private.can_read_book(book_id));
create policy "members read cards" on public.cards for select to authenticated
  using (book_id is null or private.can_read_book(book_id));
create policy "members read card versions" on public.card_versions for select to authenticated
  using (private.can_read_card(card_id));
create policy "members read page cards" on public.page_cards for select to authenticated
  using (exists (select 1 from public.pages p where p.id = page_id and private.can_read_book(p.book_id)));
create policy "signed-in users read audio index" on public.audio_files for select to authenticated
  using (true);

-- Classes: members read; only editors move the class position.
create policy "members read their classes" on public.classes for select to authenticated
  using (private.is_class_member(id));
create policy "editors move the class position" on public.classes for update to authenticated
  using (private.is_class_editor(id)) with check (private.is_class_editor(id));
revoke update on public.classes from authenticated;
grant update (current_lesson_id) on public.classes to authenticated;

-- Memberships: see your own; editors see their whole class. Joining goes through redeem_invite().
create policy "read own or managed memberships" on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_class_editor(class_id));

-- Invites: editors only.
create policy "editors read invites" on public.invites for select to authenticated
  using (private.is_class_editor(class_id));
create policy "editors create invites" on public.invites for insert to authenticated
  with check (private.is_class_editor(class_id) and created_by = (select auth.uid()));
create policy "editors delete invites" on public.invites for delete to authenticated
  using (private.is_class_editor(class_id));

-- Personal data: each student only ever sees their own rows.
create policy "own progress" on public.progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_read_card(card_id));
create policy "own saved words" on public.saved_words for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_read_card(card_id));
create policy "own checkins" on public.checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Reports: anyone who can see a card can report it; reporters and editors can read them.
create policy "members report cards" on public.reports for insert to authenticated
  with check (reporter = (select auth.uid()) and private.can_read_card(card_id));
create policy "reporters and editors read reports" on public.reports for select to authenticated
  using (
    reporter = (select auth.uid())
    or exists (select 1 from public.cards c where c.id = card_id and c.book_id is not null and private.is_book_editor(c.book_id))
  );

-- ─── Joining a class with an invite code ───────────────────────────────────

create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.invites%rowtype;
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Sign in first';
  end if;

  select * into v_invite from public.invites where code = lower(trim(p_code)) for update;
  if not found or v_invite.expires_at < now() or v_invite.uses >= v_invite.max_uses then
    raise exception 'This invite code is not valid';
  end if;

  insert into public.memberships (class_id, user_id, role)
  values (v_invite.class_id, v_user, v_invite.role)
  on conflict (class_id, user_id) do nothing;

  if found then
    update public.invites set uses = uses + 1 where code = v_invite.code;
  end if;
  return v_invite.class_id;
end;
$$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ─── Audio storage ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "signed-in users play audio" on storage.objects for select to authenticated
  using (bucket_id = 'audio');
