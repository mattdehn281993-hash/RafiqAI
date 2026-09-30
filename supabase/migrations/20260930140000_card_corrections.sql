-- Corrections: editors fix a card as a new version (meaning, pronunciation and
-- audio text together), and resolve the classmates' reports. Old versions stay
-- as history; the new version's text gets its own audio on first play.
-- Called only by the card-review edge function (service role).

create function private.is_card_editor(p_user uuid, p_card uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cards k
    join public.classes c on c.book_id = k.book_id
    join public.memberships m on m.class_id = c.id
    where k.id = p_card and m.user_id = p_user and m.role = 'editor'
  );
$$;
revoke all on function private.is_card_editor(uuid, uuid) from public, anon, authenticated;

create function public.correct_card(p_user uuid, p_card uuid, p_changes jsonb, p_reason text, p_report uuid default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_current int;
  v_next int;
begin
  if not private.is_card_editor(p_user, p_card) then
    raise exception 'Only editors can change shared cards';
  end if;

  select current_version into v_current from public.cards where id = p_card for update;
  v_next := v_current + 1;

  insert into public.card_versions (
    card_id, version, arabic_printed, arabic_full, tts_text, pronunciation, english,
    sound_note, needs_checking, needs_checking_reason, changed_by, reason
  )
  select
    p_card, v_next,
    coalesce(p_changes->>'arabic_printed', v.arabic_printed),
    coalesce(p_changes->>'arabic_full', v.arabic_full),
    coalesce(p_changes->>'tts_text', v.tts_text),
    coalesce(p_changes->>'pronunciation', v.pronunciation),
    coalesce(p_changes->>'english', v.english),
    case when p_changes ? 'sound_note' then p_changes->>'sound_note' else v.sound_note end,
    coalesce((p_changes->>'needs_checking')::boolean, v.needs_checking),
    case when p_changes ? 'needs_checking_reason' then p_changes->>'needs_checking_reason' else v.needs_checking_reason end,
    p_user,
    coalesce(nullif(trim(p_reason), ''), 'correction')
  from public.card_versions v
  where v.card_id = p_card and v.version = v_current;

  update public.cards set current_version = v_next where id = p_card;

  if p_report is not null then
    update public.reports
    set status = 'accepted', resolved_by = p_user, resolved_at = now()
    where id = p_report and card_id = p_card and status = 'open';
  end if;
  return v_next;
end;
$$;

create function public.dismiss_report(p_user uuid, p_report uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_card uuid;
begin
  select card_id into v_card from public.reports where id = p_report;
  if v_card is null or not private.is_card_editor(p_user, v_card) then
    raise exception 'Only editors can resolve reports';
  end if;
  update public.reports
  set status = 'rejected', resolved_by = p_user, resolved_at = now()
  where id = p_report and status = 'open';
end;
$$;

revoke all on function public.correct_card(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.dismiss_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.correct_card(uuid, uuid, jsonb, text, uuid) to service_role;
grant execute on function public.dismiss_report(uuid, uuid) to service_role;
