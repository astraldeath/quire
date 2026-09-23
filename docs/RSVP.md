# RSVP reading

Open a reflowable text book, then choose **Reading settings > RSVP > Start RSVP**.
The reader starts paused at the current passage. Press **Play**, or use Space
outside an input, to advance one word at a time. **Rewind sentence** pauses and
returns to the beginning of the sentence; pressing it again moves to the previous
sentence. **Back to page** returns to the displayed word's passage.

The default speed is 250 words per minute, adjustable from 60 to 1000. Turn
**Pause at punctuation** on or off in reading settings. When enabled, commas and
semicolons receive 1.5 times the base dwell, sentence endings twice the base dwell,
and paragraph endings 2.5 times the base dwell. These delays do not multiply.

Playback pauses when the app loses focus, enters the background, shows a privacy
cover or dialog, or when you leave RSVP. Resume explicitly with Play. Delayed
background timers do not advance through unread words.

EPUB and supported formats normalized to reflowable text can use RSVP. Comics,
PDFs, fixed-layout EPUBs, and image-only pages do not offer the entry. No OCR is
performed. Images and navigation text are skipped; ruby pronunciation is omitted
to avoid duplicating the main text. Word segmentation follows the publication
language when available. Sentence segmentation includes common title abbreviations.

RSVP retains the current section and at most one prefetched section. It uses the
same sanitized publication text and normal EPUB CFI locators as the page reader.
Linked publisher styles are read from the local archive, never fetched from an
external website. Position saves occur every five seconds during playback and
on pause, chapter transitions, and exit. Existing Quire position sync and backups
continue to apply. The percentage is a section-weighted estimate; the CFI identifies
the actual displayed word.

Statistics count active foreground playback time and chapter boundaries reached
through playback. Paused time is excluded. The chosen WPM is a display setting,
not a measured reading-speed sample. Chapter identities use the existing book
structure and immutable activity history, so replay does not inflate chapter totals.
Rewinding preserves completed chapter progress while moving the current position.

RSVP speed and punctuation preferences are included in ordinary backups. Older
preferences restore to 250 WPM with punctuation pauses enabled.
