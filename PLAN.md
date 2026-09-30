# Rafiq (Arabic Class Companion) — Build Plan

Build plan for the Arabic Class Companion described in [the PRD](<Arabic Class Companion — PRD original.md>).
Last updated: 2026-09-30.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | React + TypeScript + Vite, installable PWA, Tailwind | PRD asks for a phone-first web app; Phase 2 needs offline lesson download (service worker) |
| Backend | Supabase: Postgres + row-level security, Auth (invite-only), Storage, Edge Functions | Per PRD |
| Page reading | Claude Opus 5 (`claude-opus-5`), structured JSON output, adaptive thinking | Each page is read once and shared, so per-page cost is small; accuracy on vowel marks matters most |
| Voice | ElevenLabs, one locked Fusha voice | Per PRD |

Shared logic (card schema, prompt, vowel-mark comparison) lives in `shared/` as plain TypeScript with explicit `.ts` imports, so the same files run under Node (Phase 0 scripts) and Deno (Supabase Edge Functions).

### Edge functions

- `read-contents` — table-of-contents photo → ordered lesson list (Book Map)
- `explain-page` — page photo → one card per Arabic item, in right-to-left reading order, with layout position
- `get-audio` — returns cached audio if present; otherwise calls ElevenLabs once, stores the file, returns it

The page photo is sent straight from the phone to `explain-page` and is never written to Supabase Storage. It stays on the phone until the student confirms the extracted text, then it is deleted (PRD requirement).

## Key design decisions

1. **AI-added vowel marks are detected in code, not self-reported.** Claude returns each item twice: `arabic_printed` (exactly the marks visible on the page) and `arabic_full` (every mark filled in). A mark-by-mark diff in `shared/harakat.ts` finds which marks were added. If the two versions disagree on the letters themselves, or the full version drops a printed mark, the item is flagged "Needs checking".
2. **Added marks shown lighter via two stacked layers.** Browsers can't reliably colour a single combining mark. The UI draws the full text in a light colour, then the printed-only text in full colour exactly on top. Marks don't change letter widths, so the layers line up and only the added marks show through as light.
3. **Audio always matches the easy pronunciation.** Each card stores `tts_text`: the exact fully-vowelled pause form sent to ElevenLabs. `pronunciation` is written from `tts_text`, not from the display text.
4. **Audio deduplicated by content hash.** The storage path is `hash(tts_text + voice_id + model_id)`. The same word on two pages shares one file, and a correction yields new text and therefore new audio automatically.
5. **Letter names vs letter sounds.** A bare letter (ب) is a `letter` card whose `tts_text` is its spelled-out name (بَاء); a letter with a vowel (بَ) is a `syllable` card. Separate cards, separate audio (PRD pronunciation policy).
6. **Slow audio** = the same file played at `playbackRate ≈ 0.7` with `preservesPitch`.

## Data model

From the PRD: `books`, `lessons`, `pages`, `cards`, `card_versions`, `progress`, `classes`, `memberships`.

Additions:

| Table | Holds | Why |
|---|---|---|
| `page_cards` | page, card, reading order, row, column | Reproduce the page layout; the same card can appear on many pages |
| `reports` | card, reporter, message, status | Corrections review queue (only editors change shared cards) |
| `saved_words` | student, card, lesson | My Words |
| `checkins` | student, lesson, date, answer (yes/partly/no) | "I followed most of today's lesson" success metric |
| `audio_files` | content hash, storage path, voice, model, status (tts / native recording) | Audio cache + native-recording fallback |

RLS: `progress`, `saved_words` and `checkins` are private to the student. Class members can read the class's pages, cards and audio. Only editors write cards; any member can insert a report.

## Phases

The roadmap diagram in the PRD did not survive the markdown export, so this ordering is a proposal to confirm.

### Phase 0 — De-risk (before app code)

- [x] **Page-reading spike** (`npm run spike:pages`): built; run on 8 real photos (lesson 1 pages 8–13, introduction pages 2–3).
- [ ] Score the page-reading report against the Gate 1 checklist (human check of meanings and marks).
- [x] **Book Map spike** (`npm run spike:contents`): all 62 contents rows, 8 units and page numbers correct on first run (107 s, $0.38).
- [x] **Photo orientation**: every test photo arrived sideways. Picking the upright one of four rotations was right on 14/14; asking for degrees on one thumbnail was wrong on 4/14.
- [x] **Audio spike** (`npm run spike:audio`): 264 clips generated (1 voice × `eleven_multilingual_v2` + `eleven_v3`).
- [ ] Listen to the audio report and mark pass/fail. `eleven_v3` single syllables run ~2.5 s (vs ~0.7 s on v2): check for extra sounds.
- [ ] Decide: is whole-page reading accurate enough on small print, or do dense pages need to be split into tiles?

**Findings so far (2026-09-30)**

- Lesson pages take 24–63 s and cost about $0.10–0.20 each at effort high; the dense introduction page took 3 min.
- Handwritten student notes, fingers and neighbouring pages were ignored correctly.
- Prompt v1/v2 problems fixed in v3: guessed word endings on every card, "correcting" the book's own marks (sukun on long vowels, أُكْتُبْ), inconsistent stress capitals, blank-filling answers stated as fact. The mark-diff check caught each one.
- The book teaches letter shapes (initial/middle/final) from lesson 1 (page 10). Page Helper covers this for book pages, but Learn cards shapes are planned for Phase 3: consider moving them earlier.

### Phase 1 — Understand today's page → Gate 1

- [ ] Supabase project, schema, RLS, invite-only auth, classes and memberships
- [ ] Book Map (`read-contents`), lesson list, class position
- [ ] Page Helper (`explain-page`) with confirm/correct step and photo deletion
- [ ] Audio (`get-audio`), normal + slow
- [ ] Today's Class home screen, "We covered up to here"
- [ ] My Words
- [ ] Needs checking + retake, Report a mistake, card versions, editor review queue
- [ ] **Gate 1** on the real textbook (checklist in PRD)

### Phase 2 — Arrive prepared

- [ ] Tonight's Preview + 2-minute quiz
- [ ] Learn cards levels 1–4 (seed content, human-reviewed), excluding letter shapes
- [ ] Practice: hear-and-pick, see-and-say, flip cards
- [ ] Review queue with spaced repetition
- [ ] Offline lesson download with ready indicator and retry

### Phase 3 — Complete v1

- [ ] Letter shapes (initial/medial/final), joining, look-alike letters
- [ ] Hiding the English and pronunciation hints step by step
- [ ] Classmate onboarding (after textbook permission is settled)

## Open items

- [x] Real textbook photos: title, contents (3 pages), introduction, lesson 1 pages 8–13
- [x] Textbook: سلسلة الأزهر الشريف لتعليم اللغة العربية لغير الناطقين بها — المستوى التمهيدي (Al-Azhar series, Preparatory Level), Sheikh Zayed Center / World Organization for Al-Azhar Graduates, 1445 AH / 2024. 8 units: units 1–4 teach the 28 letters (ب … ي, then الهمزة); units 5–8 revisit them with dialogues plus vowels, sukun, shadda, tanween.
- [ ] Create a new Supabase project (none of the existing projects is for this app)
- [x] `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_IDS` in `.env`
- [ ] Confirm phase order: Tonight's Preview is in Phase 2 here; the PRD calls it "the heart" of the app
- [ ] Class meeting days (for Tonight's Preview timing)
