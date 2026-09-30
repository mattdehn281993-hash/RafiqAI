-- Speaking practice: a short, generated conversation that shows how a textbook
-- word is used. Kept apart from the card itself, so the textbook transcription
-- and its version history never change when practice is created or edited.
-- One practice conversation per card, shared by everyone who can see the card.

create table public.card_usages (
  card_id uuid primary key references public.cards on delete cascade,
  usage jsonb not null check (
    jsonb_typeof(usage) = 'object'
    and usage ?& array[
      'context', 'prompt_arabic', 'prompt_pronunciation', 'prompt_english',
      'response_arabic', 'response_pronunciation', 'response_english', 'tip'
    ]
  ),
  source text not null default 'generated' check (source in ('generated', 'editor')),
  created_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.card_usages enable row level security;
create policy "members read practice" on public.card_usages for select to authenticated
  using (private.can_read_card(card_id));
-- Writes go through the functions below (service role), which check who is asking.

-- Cards now carry their practice conversation (or null) alongside the text.
create or replace view public.current_cards with (security_invoker = true) as
  select c.id, c.book_id, c.level, c.kind, c.current_version,
         v.arabic_printed, v.arabic_full, v.tts_text, v.pronunciation, v.english,
         v.sound_note, v.needs_checking, v.needs_checking_reason, v.audio_hash,
         v.created_at as version_created_at, u.usage
  from public.cards c
  join public.card_versions v on v.card_id = c.id and v.version = c.current_version
  left join public.card_usages u on u.card_id = c.id;

-- Generated practice for a saved page (any class member). Only fills cards on
-- that page that have none yet; a null or JSON-null usage means "not useful in
-- conversation" and is skipped. Returns how many were added.
create function public.save_page_usages(p_user uuid, p_page uuid, p_items jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  v_added int := 0;
  v_rows int;
begin
  if not exists (
    select 1 from public.pages p
    join public.classes c on c.book_id = p.book_id
    join public.memberships m on m.class_id = c.id
    where p.id = p_page and m.user_id = p_user
  ) then
    raise exception 'You cannot add practice to this page';
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it->'usage') is distinct from 'object' then
      continue;
    end if;
    insert into public.card_usages (card_id, usage, source, created_by)
    select pc.card_id, it->'usage', 'generated', p_user
    from public.page_cards pc
    where pc.page_id = p_page and pc.card_id = (it->>'card_id')::uuid
    on conflict (card_id) do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;
  return v_added;
end;
$$;

-- Editors: replace a card's practice conversation, or remove it (null or JSON null).
create function public.set_card_usage(p_user uuid, p_card uuid, p_usage jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_card_editor(p_user, p_card) then
    raise exception 'Only editors can change shared cards';
  end if;
  if p_usage is null or jsonb_typeof(p_usage) = 'null' then
    delete from public.card_usages where card_id = p_card;
  else
    insert into public.card_usages (card_id, usage, source, created_by, updated_at)
    values (p_card, p_usage, 'editor', p_user, now())
    on conflict (card_id) do update
      set usage = excluded.usage, source = 'editor', created_by = excluded.created_by, updated_at = now();
  end if;
end;
$$;

revoke all on function public.save_page_usages(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_card_usage(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_page_usages(uuid, uuid, jsonb) to service_role;
grant execute on function public.set_card_usage(uuid, uuid, jsonb) to service_role;
