# BRAVAS flyers and calendar

Everything on the calendar (`/events/`) and the homepage "On the calendar" flyer
comes from one file: **`assets/flyers/flyers.json`**.

* **Weekly flyers publish themselves.** Each day at the publish time (default
  9:00 AM Eastern, `settings.defaultPublishTime`), that day's flyer becomes
  "Today" on the homepage and calendar. At midnight Eastern it rolls to the next
  day. No uploads, commits or deploys are needed for the regular week.
* **Tuesdays are closed** unless a dated entry says `"open": true`.
* Times are 24-hour `HH:MM` in Eastern time (`"09:00"`, `"17:30"`).

## Replace one day with a special event

1. **Upload the flyer:** on GitHub open `assets/flyers/` → **Add file → Upload files**.
   Name it like `holiday-party-2026-12-19.webp` (png, jpg or webp; no spaces).
   Commit directly to `main`.
2. **Edit `assets/flyers/flyers.json`:** click the pencil icon and add an entry
   inside the `"flyers": [ ... ]` list (put a comma between entries):

   ```json
   {
     "date": "2026-12-19",
     "title": "Holiday Party with DJ Juice",
     "src": "/assets/flyers/holiday-party-2026-12-19.webp",
     "alt": "Holiday Party with DJ Juice at BRAVAS, December 19, 2026.",
     "publishAt": "09:00",
     "time": "8 PM–1 AM",
     "lead": "Our end-of-year party. Dress to impress.",
     "reserve": "https://tally.so/r/RWdAv4?date=2026-12-19"
   }
   ```

   Only `date` and `title` are required. `src` is the flyer. `publishAt`
   overrides the publish time for that day. `time` is the event hours shown on
   the site. `lead` is the description. `reserve` is the reservation link
   (default: the Tally form with the date filled in). Add `"rows": [["DJ", "DJ Juice"]]`
   for extra detail lines.
3. **Commit to `main`.** GitHub Pages publishes in a minute or two. The
   "Validate event calendar" check on the commit (Actions tab) turns red with
   the exact problem if a date, time, duplicate or flyer file is wrong.

The special event replaces the regular night for that date only; the regular
theme returns the next week.

## Close one date

```json
{ "date": "2026-11-26", "closed": true, "title": "Closed for Thanksgiving" }
```

## Open a Tuesday

Add `"open": true` to the Tuesday entry, e.g.
`{ "date": "2026-12-01", "open": true, "title": "Tuesday Takeover", "src": "/assets/flyers/tuesday-takeover.webp" }`.

## Change a weekly flyer or publish time

* Replace the image in `assets/flyers/weekly/` with a file of the **same name**
  (`members-monday.webp`, `spoken-word-wednesday.webp`, `throwback-thursday.webp`,
  `feel-good-friday.webp`, `vip-saturday.webp`, `sunday-funday-brunch.webp`).
* Change every day's publish time with `settings.defaultPublishTime`, or one
  weekday with `settings.publishTimes`, e.g. `"publishTimes": { "sunday": "08:00" }`.

## Check before committing (optional)

```bash
node scripts/validate-events.js
node --test tests/schedule.test.js
```
