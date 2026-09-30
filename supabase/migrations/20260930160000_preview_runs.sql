-- Tonight's Preview completions and quiz scores (success metric: "Tonight's
-- Preview completed before most classes"). Private to each student.
create table public.preview_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id uuid not null references public.lessons on delete cascade,
  completed_at timestamptz not null default now(),
  score int not null check (score >= 0),
  total int not null check (total >= 0)
);
create index on public.preview_runs (user_id, lesson_id);
create index on public.preview_runs (lesson_id);

alter table public.preview_runs enable row level security;
create policy "own preview runs" on public.preview_runs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.lessons l where l.id = lesson_id and private.can_read_book(l.book_id)
  ));
