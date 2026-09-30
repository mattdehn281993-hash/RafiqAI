export type Role = "student" | "editor";

export type ClassInfo = {
  id: string;
  name: string;
  book_id: string;
  current_lesson_id: string | null;
  role: Role;
  book: { title_ar: string; title_en: string | null; level_en: string | null };
};

export type Lesson = {
  id: string;
  position: number;
  unit_id: string | null;
  number_label: string | null;
  title_ar: string;
  title_en: string | null;
  kind: "front_matter" | "letter" | "dialogue" | "language_point" | "review" | "other";
  focus: string | null;
  start_page: number | null;
};

export type Unit = { id: string; position: number; title_ar: string | null; title_en: string | null; letters: string | null };

export type PageRow = {
  id: string;
  lesson_id: string | null;
  page_number: number | null;
  page_kind: string | null;
  summary: string | null;
  scanned_at: string;
};

export type CardUsage = {
  context: string;
  prompt_arabic: string;
  prompt_pronunciation: string;
  prompt_english: string;
  response_arabic: string;
  response_pronunciation: string;
  response_english: string;
  tip: string;
};

export type Card = {
  id: string;
  book_id: string | null;
  /** built-in course level (1 sounds, 4 conversation); null for book cards */
  level?: number | null;
  kind: string;
  current_version: number;
  arabic_printed: string;
  arabic_full: string;
  tts_text: string;
  pronunciation: string;
  english: string;
  sound_note: string | null;
  usage: CardUsage | null;
  needs_checking: boolean;
  needs_checking_reason: string | null;
};

export type PlacedCard = Card & { position: number; row_index: number | null; col_index: number | null };
