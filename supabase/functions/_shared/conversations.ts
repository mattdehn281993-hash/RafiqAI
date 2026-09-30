// Built-in course, Level 4 (Everyday conversation): greetings, how are you,
// names, where you're from, age, and a dialogue that puts them together.
// Drafted for a Modern Standard Arabic conversation class; a teacher or native
// speaker should check it before classmates rely on it (see PLAN.md).
//
// Each phrase: `arabic` is what the card shows (full vowel marks), `tts` is
// exactly what the voice says, and `pron` spells `tts` using the key in
// explain-page-prompt.ts. Questions keep their -ka / -ki endings, because in
// conversation they tell a man and a woman apart.

export type Phrase = {
  key: string;
  arabic: string;
  tts: string;
  pron: string;
  english: string;
  note?: string;
};

export type DialogueLine = { speaker: "A" | "B"; phrase: string };

export type Topic = {
  key: string;
  title: string;
  title_ar: string;
  summary: string;
  phrases: Phrase[];
  dialogue?: DialogueLine[];
};

export const TOPICS: Topic[] = [
  {
    key: "greetings",
    title: "Greetings",
    title_ar: "التَّحِيَّةُ",
    summary: "Hello, good morning, good evening, welcome and goodbye",
    phrases: [
      { key: "salam", arabic: "السَّلَامُ عَلَيْكُمْ", tts: "اَلسَّلَامُ عَلَيْكُمْ", pron: "as-sa-LAA-mu ʿa-LAY-kum", english: "Peace be upon you (hello)", note: "The everyday greeting. Say it when you arrive, to one person or many." },
      { key: "salam-reply", arabic: "وَعَلَيْكُمُ السَّلَامُ", tts: "وَعَلَيْكُمُ السَّلَامْ", pron: "wa-ʿa-LAY-ku-mus sa-LAAM", english: "And peace be upon you (the reply)" },
      { key: "morning", arabic: "صَبَاحُ الْخَيْرِ", tts: "صَبَاحُ الْخَيْرْ", pron: "ṣa-BAA-ḥul khayr", english: "Good morning" },
      { key: "morning-reply", arabic: "صَبَاحُ النُّورِ", tts: "صَبَاحُ النُّورْ", pron: "ṣa-BAA-ḥun nuur", english: "Good morning (the reply: “morning of light”)" },
      { key: "evening", arabic: "مَسَاءُ الْخَيْرِ", tts: "مَسَاءُ الْخَيْرْ", pron: "ma-SAA-ʾul khayr", english: "Good afternoon / good evening", note: "Used from the afternoon onwards." },
      { key: "evening-reply", arabic: "مَسَاءُ النُّورِ", tts: "مَسَاءُ النُّورْ", pron: "ma-SAA-ʾun nuur", english: "Good afternoon / good evening (the reply)" },
      { key: "welcome", arabic: "أَهْلًا وَسَهْلًا", tts: "أَهْلًا وَسَهْلَا", pron: "AH-lan wa-SAH-laa", english: "Welcome!" },
      { key: "goodbye", arabic: "مَعَ السَّلَامَةِ", tts: "مَعَ السَّلَامَهْ", pron: "MA-ʿas sa-LAA-mah", english: "Goodbye (“go with safety”)" },
    ],
  },
  {
    key: "how-are-you",
    title: "How are you?",
    title_ar: "كَيْفَ الْحَالُ؟",
    summary: "Asking how someone is, answering, and thanking",
    phrases: [
      { key: "how-m", arabic: "كَيْفَ حَالُكَ؟", tts: "كَيْفَ حَالُكَ؟", pron: "KAY-fa ḤAA-lu-ka", english: "How are you? (to a man)", note: "حَ is a breathy h from deep in the throat. End with -ka for a man." },
      { key: "how-f", arabic: "كَيْفَ حَالُكِ؟", tts: "كَيْفَ حَالُكِ؟", pron: "KAY-fa ḤAA-lu-ki", english: "How are you? (to a woman)", note: "End with -ki for a woman." },
      { key: "fine", arabic: "أَنَا بِخَيْرٍ، وَالْحَمْدُ لِلَّهِ", tts: "أَنَا بِخَيْرٍ، وَالْحَمْدُ لِلَّهْ", pron: "A-naa bi-KHAY-rin, wal-ḤAM-du lil-LAAH", english: "I'm fine, thank God", note: "خ is a rough kh at the back of the throat, like Scottish “loch”." },
      { key: "and-you-m", arabic: "وَأَنْتَ؟", tts: "وَأَنْتَ؟", pron: "wa-AN-ta", english: "And you? (to a man)" },
      { key: "and-you-f", arabic: "وَأَنْتِ؟", tts: "وَأَنْتِ؟", pron: "wa-AN-ti", english: "And you? (to a woman)" },
      { key: "thanks", arabic: "شُكْرًا", tts: "شُكْرًا", pron: "SHUK-ran", english: "Thank you" },
      { key: "welcome-reply", arabic: "عَفْوًا", tts: "عَفْوًا", pron: "ʿAF-wan", english: "You're welcome", note: "ع is a tight squeeze deep in the throat, not an English sound." },
    ],
  },
  {
    key: "name",
    title: "What's your name?",
    title_ar: "مَا اسْمُكَ؟",
    summary: "Asking and giving your name",
    phrases: [
      { key: "name-q-m", arabic: "مَا اسْمُكَ؟", tts: "مَا اسْمُكَ؟", pron: "MAS-mu-ka", english: "What's your name? (to a man)", note: "مَا and اسْمُكَ run together: “mas-mu-ka”." },
      { key: "name-q-f", arabic: "مَا اسْمُكِ؟", tts: "مَا اسْمُكِ؟", pron: "MAS-mu-ki", english: "What's your name? (to a woman)" },
      { key: "my-name", arabic: "اِسْمِي دَيْفِيد", tts: "اِسْمِي دَيْفِيدْ", pron: "IS-mii DAY-fiid", english: "My name is David", note: "Put your own name after اِسْمِي (ismii, “my name”)." },
      { key: "nice-to-meet", arabic: "تَشَرَّفْنَا", tts: "تَشَرَّفْنَا", pron: "ta-shar-RAF-naa", english: "Nice to meet you (“we are honoured”)" },
    ],
  },
  {
    key: "from",
    title: "Where are you from?",
    title_ar: "مِنْ أَيْنَ أَنْتَ؟",
    summary: "Asking and saying where you're from",
    phrases: [
      { key: "from-q-m", arabic: "مِنْ أَيْنَ أَنْتَ؟", tts: "مِنْ أَيْنَ أَنْتَ؟", pron: "min AY-na AN-ta", english: "Where are you from? (to a man)" },
      { key: "from-q-f", arabic: "مِنْ أَيْنَ أَنْتِ؟", tts: "مِنْ أَيْنَ أَنْتِ؟", pron: "min AY-na AN-ti", english: "Where are you from? (to a woman)" },
      { key: "from-nigeria", arabic: "أَنَا مِنْ نَيْجِيرْيَا", tts: "أَنَا مِنْ نَيْجِيرْيَا", pron: "A-naa min nay-JIIR-yaa", english: "I'm from Nigeria" },
      { key: "from-egypt", arabic: "أَنَا مِنْ مِصْرَ", tts: "أَنَا مِنْ مِصْرْ", pron: "A-naa min miṣr", english: "I'm from Egypt", note: "ص is a heavy s: say it with the tongue low and the mouth round." },
    ],
  },
  {
    key: "age",
    title: "How old are you?",
    title_ar: "كَمْ عُمْرُكَ؟",
    summary: "Asking and saying your age",
    phrases: [
      { key: "age-q-m", arabic: "كَمْ عُمْرُكَ؟", tts: "كَمْ عُمْرُكَ؟", pron: "kam ʿUM-ru-ka", english: "How old are you? (to a man)" },
      { key: "age-q-f", arabic: "كَمْ عُمْرُكِ؟", tts: "كَمْ عُمْرُكِ؟", pron: "kam ʿUM-ru-ki", english: "How old are you? (to a woman)" },
      { key: "age-20", arabic: "عُمْرِي عِشْرُونَ سَنَةً", tts: "عُمْرِي عِشْرُونَ سَنَهْ", pron: "ʿUM-rii ʿish-RUU-na SA-nah", english: "I am twenty years old", note: "عُمْرِي (ʿumrii) means “my age”; then the number and سَنَة (year)." },
      { key: "age-30", arabic: "عُمْرِي ثَلَاثُونَ سَنَةً", tts: "عُمْرِي ثَلَاثُونَ سَنَهْ", pron: "ʿUM-rii tha-laa-THUU-na SA-nah", english: "I am thirty years old", note: "ث is th as in “think”." },
    ],
  },
  {
    key: "first-conversation",
    title: "First conversation",
    title_ar: "أَوَّلُ حِوَارٍ",
    summary: "Put it together: meet a classmate",
    phrases: [],
    dialogue: [
      { speaker: "A", phrase: "salam" },
      { speaker: "B", phrase: "salam-reply" },
      { speaker: "A", phrase: "how-m" },
      { speaker: "B", phrase: "fine" },
      { speaker: "B", phrase: "and-you-m" },
      { speaker: "A", phrase: "fine" },
      { speaker: "A", phrase: "name-q-m" },
      { speaker: "B", phrase: "my-name" },
      { speaker: "A", phrase: "nice-to-meet" },
      { speaker: "A", phrase: "from-q-m" },
      { speaker: "B", phrase: "from-nigeria" },
      { speaker: "A", phrase: "age-q-m" },
      { speaker: "B", phrase: "age-20" },
      { speaker: "A", phrase: "thanks" },
      { speaker: "B", phrase: "welcome-reply" },
      { speaker: "A", phrase: "goodbye" },
      { speaker: "B", phrase: "goodbye" },
    ],
  },
];

/** Every phrase with its built-in card key (`conv-<phrase key>`). */
export function conversationPhrases(): (Phrase & { builtin_key: string })[] {
  return TOPICS.flatMap((t) => t.phrases.map((p) => ({ ...p, builtin_key: `conv-${p.key}` })));
}

/** A topic's phrases in order: its own, or the dialogue's lines (each once). */
export function topicPhraseKeys(topic: Topic): string[] {
  if (topic.phrases.length) return topic.phrases.map((p) => `conv-${p.key}`);
  return [...new Set((topic.dialogue ?? []).map((l) => `conv-${l.phrase}`))];
}
