-- Writes that must happen all at once, called only by edge functions (service
-- role) after they have checked who is asking. Not callable from the app.

-- Book Map: book + units + lessons + class, with the creator as the class editor.
create function public.create_class_from_book_map(p_user uuid, p_class_name text, p_map jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_book uuid;
  v_class uuid;
  v_unit uuid;
  v_unit_pos int := 0;
  v_lesson_pos int := 0;
  v_first_lesson uuid;
  u jsonb;
  l jsonb;
begin
  insert into public.books (title_ar, title_en, level_ar, level_en, publisher, year, created_by)
  values (
    coalesce(nullif(p_map->>'book_title_ar', ''), 'Textbook'),
    p_map->>'book_title_en', p_map->>'level_ar', p_map->>'level_en',
    p_map->>'publisher', p_map->>'year', p_user
  )
  returning id into v_book;

  for u in select value from jsonb_array_elements(p_map->'units') loop
    v_unit_pos := v_unit_pos + 1;
    insert into public.units (book_id, position, title_ar, title_en, letters)
    values (v_book, v_unit_pos, u->>'title_ar', u->>'title_en', u->>'letters')
    returning id into v_unit;

    for l in select value from jsonb_array_elements(u->'lessons') loop
      v_lesson_pos := v_lesson_pos + 1;
      insert into public.lessons (book_id, unit_id, position, number_label, title_ar, title_en, kind, focus, start_page)
      values (
        v_book, v_unit, v_lesson_pos, l->>'number_label', l->>'title_ar', l->>'title_en',
        l->>'kind', l->>'focus', (l->>'page')::int
      );
    end loop;
  end loop;

  select id into v_first_lesson from public.lessons
  where book_id = v_book and kind <> 'front_matter'
  order by position limit 1;

  insert into public.classes (book_id, name, current_lesson_id, created_by)
  values (v_book, p_class_name, v_first_lesson, p_user)
  returning id into v_class;

  insert into public.memberships (class_id, user_id, role) values (v_class, p_user, 'editor');
  return v_class;
end;
$$;

-- Page Helper: a confirmed page with its cards (version 1) in reading order.
-- A page number already saved for the book raises unique_violation (23505).
create function public.save_scanned_page(p_user uuid, p_book uuid, p_lesson uuid, p_model text, p_prompt_version text, p_page jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_page uuid;
  v_card uuid;
  v_pos int := 0;
  it jsonb;
begin
  if p_lesson is not null and not exists (select 1 from public.lessons where id = p_lesson and book_id = p_book) then
    raise exception 'Lesson does not belong to this book';
  end if;

  insert into public.pages (
    book_id, lesson_id, page_number, page_kind, summary, image_quality, image_quality_note,
    skipped, model, prompt_version, status, scanned_by, confirmed_at
  )
  values (
    p_book, p_lesson, (p_page->>'page_number')::int, p_page->>'page_kind', p_page->>'page_summary',
    p_page->>'image_quality', p_page->>'image_quality_note', p_page->>'skipped',
    p_model, p_prompt_version, 'confirmed', p_user, now()
  )
  returning id into v_page;

  for it in
    select value from jsonb_array_elements(p_page->'items') order by (value->>'order')::int
  loop
    v_pos := v_pos + 1;
    insert into public.cards (book_id, kind) values (p_book, it->>'kind') returning id into v_card;
    insert into public.card_versions (
      card_id, version, arabic_printed, arabic_full, tts_text, pronunciation, english,
      sound_note, needs_checking, needs_checking_reason, changed_by, reason
    )
    values (
      v_card, 1, it->>'arabic_printed', it->>'arabic_full', it->>'tts_text', it->>'pronunciation',
      it->>'english', it->>'sound_note', coalesce((it->>'needs_checking')::boolean, false),
      it->>'needs_checking_reason', p_user, 'scanned'
    );
    insert into public.page_cards (page_id, position, card_id, row_index, col_index)
    values (v_page, v_pos, v_card, (it->>'row')::int, (it->>'column')::int);
  end loop;

  return v_page;
end;
$$;

revoke all on function public.create_class_from_book_map(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_scanned_page(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_class_from_book_map(uuid, text, jsonb) to service_role;
grant execute on function public.save_scanned_page(uuid, uuid, uuid, text, text, jsonb) to service_role;
