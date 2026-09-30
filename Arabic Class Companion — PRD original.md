# Arabic Class Companion — PRD

Sep 30, 2026 · @David

## Problem and vision

A phone app that turns every page of the class textbook into English meaning, easy pronunciation and native-quality audio, so a total beginner walks into an Arabic-only class already knowing the lesson.

The class is taught in Fusha (Modern Standard Arabic), fully in Arabic. The teacher explains by pointing and repeating, which helps a little, but a first-time learner with no Arabic base loses most of the instructions and meanings. The result: falling behind, and fear of sounding foolish in front of other students.

The app is the missing bridge. It does not replace the class. It follows the textbook's own lesson order, previews each lesson the night before, and explains any page on demand from a photo.

## Target user and goals

The first user is a total beginner in a Fusha preparatory class taught only in Arabic, who speaks English and wants to learn fast. Built for David first, and open to any classmate who wants to join: each student gets their own account and progress from day one.

**Goals**

- Understand every lesson page: meaning, pronunciation and spelling of each letter, word and phrase
- Arrive at each class having already previewed that lesson
- Understand the teacher's recurring classroom instructions
- Progress from letters and short vowels to everyday phrases (greetings, name, age)
- Be easy enough to use in class, one-handed, in seconds

**Non-goals (v1)**

- Egyptian colloquial Arabic (the class is Fusha; Egyptian can be a later add-on)
- Replacing the teacher or the textbook
- Social features, leaderboards, payments
- Scanning the entire book in advance

## How it works

The textbook, not the app, sets the pace: snap the table of contents once, then each lesson runs through the same loop.

&#91;embedded content: textbook-first flow · one-time setup + nightly loop\]

The whole book is never scanned up front. Only the contents page (once) and the current lesson's pages (as the class reaches them) get photographed, and each page is explained once and kept.

## Core features

Six features ship in v1; Page Helper and Tonight's Preview are the heart of it.

| Feature | What it does | v1? |
| --- | --- | --- |
| Book Map | Snap the table of contents once; the app builds the lesson list in the book's order and tracks which lesson the class is on | Yes |
| Page Helper | Snap the current page; the app reads every Arabic item on it and returns meaning, easy pronunciation, spelling and audio, in the same layout as the page | Yes |
| Tonight's Preview | Each evening, a short run-through of the next lesson: key letters, words and phrases with audio, then a 2-minute quiz | Yes |
| Learn cards | Built-in ground-up course (sounds → words → classroom Arabic → everyday phrases) for anything the book skips or goes too fast on | Yes |
| Practice | Hear a sound and pick the letter; see a word and say it; flip cards for review | Yes |
| My Words | Every item saved from Page Helper lands here for review, grouped by lesson | Yes |
| Say It | Record yourself and compare with the model audio | Later |

**Page Helper details.** Output per item: Arabic with full vowel marks, easy pronunciation (ki-TAAB), English meaning, audio at normal and slow speed, and a one-line note for tricky sounds. Instruction lines on the page (like أُنْظُرْ وَلَاحِظْ) are translated too, so the student knows what the exercise wants. Scanned pages are saved to their lesson, so a page is only ever snapped once. The photo stays on the phone only until the student confirms the extracted text, then it is deleted.

**Today's Class (home screen, Phase 1).** Shows the current lesson, its saved pages, a Continue preview button and quick access to classroom instructions. A "We covered up to here" control moves the class position when the teacher goes faster or slower than the book.

**Corrections (Phase 1).** Unclear items are flagged "Needs checking" instead of guessed, with a retake option. Every card has "Report a mistake". A correction updates meaning, pronunciation and audio together as a new card version. Only editors change shared cards; classmates' reports go to a review queue.

**Offline lesson download (Phase 2).** "Download this lesson" saves its cards and audio to the phone, with a ready indicator. An incomplete download shows which cards are missing and retries when back online.

**Review queue (Phase 2).** A short daily queue mixes recent cards with past mistakes; missed items come back sooner. English and pronunciation hints can be hidden step by step as the learner improves.

## Card anatomy and content levels

Every item in the app, whether from the built-in course or a scanned page, uses one card format.

| Field | Example |
| --- | --- |
| Arabic (full vowel marks) | كِتَاب |
| Easy pronunciation | ki-TAAB |
| English meaning | book |
| Audio | normal + slow |
| Sound note (optional) | ك is a normal K; stress the long "aa" |
| Lesson tag | Book lesson 1 / Level 2 |

**Built-in levels**

1. **Sounds**: the 28 letters in book order, then fatha/damma/kasra (بَ بُ بِ), long vowels, sukun, shadda, tanween; letter names vs letter sounds; letter shapes at the start, middle and end of words, joining, and look-alike letters (ب ت ث). Shapes and joining arrive in Phase 3
2. **First words**: simple words using only letters already learned (باب، بيت، كتاب، قلم)
3. **Classroom Arabic**: the teacher's recurring instructions (listen, repeat, look and notice, open the book, write, read) so the class itself becomes understandable
4. **Everyday phrases**: good morning, good afternoon, how are you, what's your name, how old are you, numbers, days

Level 3 comes before Level 4 on purpose: understanding the teacher unlocks every other lesson.

**Pronunciation policy**

- Words are shown and voiced in their spoken pause form by default: كِتَاب = ki-TAAB. Full endings (كِتَابٌ = ki-TAA-bun) appear only in lessons that teach them, or inside sentences read aloud.
- The easy pronunciation always matches the audio exactly; capitals mark the stressed syllable.
- Letter names (Baa) and letter sounds (ba, bu, bi) are separate cards with separate audio.
- The book's own vowel marks are shown as printed; marks the AI added are shown lighter and flagged, so a wrong guess is visible.

## Audio strategy

ElevenLabs is the voice for words and phrases, with three rules and one fallback.

1. **Full vowel marks on every input.** Send كِتَاب with its marks, never bare كتاب. Marks help the voice but don't guarantee it, so every item still gets a listening check.
2. **Generate once, reuse until corrected.** Each item's audio is created the first time it's needed, saved to storage, and reused. Cheaper and instant on replay. A corrected card gets a new version and fresh audio; the old audio is retired.
3. **A Fusha-sounding voice.** Pick and lock one voice that reads Modern Standard Arabic, not Egyptian colloquial.

**Fallback for single sounds.** TTS often struggles with isolated syllables (بَ بُ بِ) and with ع ح ق and the heavy letters. Before launch, test all 84 letter-vowel syllables. Any that sound wrong get replaced by a one-time native recording (a speaker records them once, in a single short session).

Every card offers normal and slow speed; slow is played back at a reduced rate from the same file.

## Tech architecture and data model

A phone-first web app on Supabase, with Claude reading pages and ElevenLabs voicing them; nothing is generated twice unless it is corrected. Classmates share the same scanned pages, cards and audio, while each keeps their own progress.

&#91;embedded content: architecture: app, Supabase, Claude API, ElevenLabs\]

explain-page sends the photo to Claude, which returns every Arabic item as card data; get-audio checks storage first and only calls ElevenLabs for items it has never voiced.

| Table | Holds |
| --- | --- |
| lessons | book, lesson number, title (from the contents page) |
| pages | lesson, page number, extracted Arabic, scanned date |
| cards | Arabic with marks, easy pronunciation, English, sound note, audio file, source: book page or built-in level |
| progress | student, card, times practised, last result, next review date |

Multi-student additions:

- **books**: title, edition
- **classes**: book, current lesson (moved by "We covered up to here")
- **memberships**: student, class, role (student or editor)
- **card\_versions**: card, version, content, audio file, changed by, reason

The class position lives on classes; each student's completion lives in progress. Each student's progress is private, and only editors change shared cards. Supabase row-level security enforces both, on database rows and on stored files.

## MVP scope and build phases

v1 is Phases 1 to 3; Phase 1 alone already solves the core problem of understanding the current page.

&#91;embedded content: build roadmap: 3 phases for v1, gates between\]

Each gate is tested on the real textbook: Phase 1 is done when a snapped page comes back with correct meanings, marks and audio. Timeline is to be set once the textbook and class schedule are confirmed.

**Gate 1 acceptance checklist.** Test on real pages of four kinds: a letter grid, an exercise, an instruction line and dense text.

- [ ] Every Arabic item on the page is captured
- [ ] Right-to-left reading order is kept
- [ ] English meanings are correct
- [ ] The book's own vowel marks are preserved; AI-added marks are flagged
- [ ] Audio matches the easy pronunciation exactly
- [ ] Unclear text is flagged "Needs checking", never guessed
- [ ] Targets for scan turnaround and preview length are set after this first test

## Success metrics

Success means class stops feeling lost; the app measures that through habits, not downloads.

- Tonight's Preview completed before most classes
- Every textbook page covered by the lesson scanned and explained in Page Helper
- Practice quiz accuracy rising lesson over lesson
- Classroom instructions understood without translation after the first few weeks
- Self-check after each class: "I followed most of today's lesson" (yes / partly / no)

## Risks and open questions

| Risk | Fallback |
| --- | --- |
| Photo reading misses or misreads vowel marks on small print | Show the extracted Arabic next to the photo; tap to correct before saving |
| AI adds wrong vowel marks, so audio teaches a wrong pronunciation | Keep the page's own marks when present; flag AI-added marks; the teacher or a native speaker spot-checks early lessons |
| TTS mispronounces isolated syllables or throat letters | Native recording fallback (see Audio strategy) |
| Textbook copyright if the app is shared with others | Ask the centre or publisher for permission before classmates join. Invite-only access limits who sees it, but it is not permission. Page photos are deleted after confirmation |
| Costs grow with many users | Audio cached per item and shared; Page Helper results cached per page |

**Open questions**

- [ ] Exact textbook title and edition, so the Book Map matches it
- [ ] Which days the class meets, to time Tonight's Preview
- [ ] Decided: open to classmates who want to join, by invite, once textbook permission is settled
- [ ] Egyptian colloquial add-on later, or Fusha only?
