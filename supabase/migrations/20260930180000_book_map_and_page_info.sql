-- Fixes two ways a scan could disappear:
-- 1. A class created without a lesson list (no contents pages in the photos)
--    can have one added later (set_book_map); existing pages are then filed
--    under their lessons by page number.
-- 2. A page saved without a page number or lesson can be corrected by an
--    editor (update_page_info).
-- Also: creating a class now requires at least one real lesson.
-- Called only by edge functions (service role).

-- Units and lessons from a Book Map; returns the first real lesson.
create function private.insert_book_map(p_book uuid, p_map jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_unit uuid;
  v_unit_pos int := 0;
  v_lesson_pos int := 0;
  u jsonb;
  l jsonb;
  v_first uuid;
begin
  for u in select value from jsonb_array_elements(p_map->'units') loop
    v_unit_pos := v_unit_pos + 1;
    insert into public.units (book_id, position, title_ar, title_en, letters)
    values (p_book, v_unit_pos, u->>'title_ar', u->>'title_en', u->>'letters')
    returning id into v_unit;

    for l in select value from jsonb_array_elements(u->'lessons') loop
      v_lesson_pos := v_lesson_pos + 1;
      insert into public.lessons (book_id, unit_id, position, number_label, title_ar, title_en, kind, focus, start_page)
      values (p_book, v_unit, v_lesson_pos, l->>'number_label', l->>'title_ar', l->>'title_en', l->>'kind', l->>'focus', (l->>'page')::int);
    end loop;
  end loop;

  select id into v_first from public.lessons
  where book_id = p_book and kind <> 'front_matter'
  order by position limit 1;
  if v_first is null then
    raise exception 'No lessons found in the Book Map';
  end if;
  return v_first;
end;
$$;
revoke all on function private.insert_book_map(uuid, jsonb) from public, anon, authenticated;

-- The lesson a printed page number falls in (the last lesson starting on or before it).
create function private.lesson_for_page(p_book uuid, p_page int) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.lessons
  where book_id = p_book and start_page is not null and start_page <= p_page
  order by start_page desc, position desc
  limit 1;
$$;
revoke all on function private.lesson_for_page(uuid, int) from public, anon, authenticated;

create or replace function public.create_class_from_book_map(p_user uuid, p_class_name text, p_map jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_book uuid;
  v_class uuid;
  v_first uuid;
begin
  insert into public.books (title_ar, title_en, level_ar, level_en, publisher, year, created_by)
  values (
    coalesce(nullif(p_map->>'book_title_ar', ''), 'Textbook'),
    p_map->>'book_title_en', p_map->>'level_ar', p_map->>'level_en',
    p_map->>'publisher', p_map->>'year', p_user
  )
  returning id into v_book;

  v_first := private.insert_book_map(v_book, p_map);

  insert into public.classes (book_id, name, current_lesson_id, created_by)
  values (v_book, p_class_name, v_first, p_user)
  returning id into v_class;

  insert into public.memberships (class_id, user_id, role) values (v_class, p_user, 'editor');
  return v_class;
end;
$$;

-- Add a lesson list to a class whose book has none yet (editors only).
create function public.set_book_map(p_user uuid, p_class uuid, p_map jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_book uuid;
  v_first uuid;
  v_filed int;
begin
  select c.book_id into v_book
  from public.classes c
  join public.memberships m on m.class_id = c.id and m.user_id = p_user and m.role = 'editor'
  where c.id = p_class;
  if v_book is null then
    raise exception 'Only editors can set the lesson list';
  end if;
  if exists (select 1 from public.lessons where book_id = v_book) then
    raise exception 'This class already has a lesson list';
  end if;

  v_first := private.insert_book_map(v_book, p_map);
  update public.classes set current_lesson_id = v_first where book_id = v_book and current_lesson_id is null;

  -- File pages already saved under the lesson their page number falls in.
  update public.pages p
  set lesson_id = private.lesson_for_page(v_book, p.page_number)
  where p.book_id = v_book and p.lesson_id is null and p.page_number is not null;
  get diagnostics v_filed = row_count;
  return v_filed;
end;
$$;

-- Correct a saved page's printed number and lesson (editors only). With a page
-- number and no lesson given, the lesson is worked out from the page number.
create function public.update_page_info(p_user uuid, p_page uuid, p_page_number int, p_lesson uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_book uuid;
begin
  select p.book_id into v_book from public.pages p where p.id = p_page;
  if v_book is null or not exists (
    select 1 from public.classes c
    join public.memberships m on m.class_id = c.id
    where c.book_id = v_book and m.user_id = p_user and m.role = 'editor'
  ) then
    raise exception 'Only editors can change a page';
  end if;
  if p_lesson is not null and not exists (select 1 from public.lessons where id = p_lesson and book_id = v_book) then
    raise exception 'Lesson does not belong to this book';
  end if;

  update public.pages
  set page_number = p_page_number,
      lesson_id = coalesce(p_lesson, case when p_page_number is not null then private.lesson_for_page(v_book, p_page_number) end)
  where id = p_page;
end;
$$;

revoke all on function public.set_book_map(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_page_info(uuid, uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.set_book_map(uuid, uuid, jsonb) to service_role;
grant execute on function public.update_page_info(uuid, uuid, int, uuid) to service_role;
