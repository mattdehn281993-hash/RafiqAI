# Page photos for the Phase 0 spike

Put textbook page photos here (JPG or PNG). They stay on this computer and are gitignored.

For Gate 1 we need at least one of each:

1. `1-letter-grid.jpg`: a page with a grid of letters or syllables
2. `2-exercise.jpg`: an exercise page
3. `3-instruction.jpg`: a page with instruction lines (like أُنْظُرْ وَلَاحِظْ)
4. `4-dense-text.jpg`: the densest text page you can find
5. `0-contents.jpg`: the table of contents (for Book Map later)

Tips: shoot straight down in daylight, fill the frame with the page, and avoid shadows
across the text. Take one normal photo per page; don't retouch it. We want to see how
the app copes with the photos a student will really take.

iPhone: HEIC photos may not load. Set Settings → Camera → Formats → Most Compatible,
or export as JPEG.

Then run from the project root:

    npm run spike:pages
