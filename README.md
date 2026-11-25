# tryout-builds (RosterPulse)

Builds and source for RosterPulse, Jeff's tryout and camp evaluation app.

- `test/` holds the current test build (`app.json`, `build.txt`). The updater Worker `tryout-updater` checks every 5 minutes and installs it on https://tryouttest.jeffscarcello.workers.dev when `build.txt` changes.
- `source/` holds all the source. `python3 build.py` writes `dist/app.json` and `dist/build.txt`. Tests are in `source/test/`.
- There is no live site yet, so there is no `live/` or `pending/` folder. When a live site is added, the live build goes in `live/` and the daily task puts fixes waiting for Jeff's yes in `pending/` (the updater must ignore `pending/`).

## Updates
- `/api/health` on the site says which build is installed (never cached).
- Home, More, Check for updates asks `/api/health`; if the build differs it clears stored copies and reloads. The same check runs on open and when the app comes back to the screen, offering "A new version of RosterPulse is ready" with Update now.

## Report a problem (since nov25-t29)
- Home, More, Report a problem (right under Check for updates) opens `reportSheet()`: two boxes, What happened? and What did you expect?, then Open email. `reportProblem(what, expected)` in `source/src/js/main.js` opens
  `mailto:support@shotpulse.app` with subject `RosterPulse problem (<build>)` and a body: `1) What happened: …`, `2) What I expected: …`, `— Details for the fix (please leave) —`, then `• ` lines from `reportInfo()` (build, device and OS version, Home Screen app or browser, screen and window size, page, online, events, players, templates, time, browser).
- After 1.2 s a toast says "If no email opened, write to support@shotpulse.app".
- Line breaks are sent as CRLF. The Gmail app on iPhone still drops them when it sends, so every line starts with a marker (1), 2), •) that reads well when run together (t30).
- Test hook: `window.__rp.reportInfo`, `reportUrl`, `reportProblem`, `reportSheet`. Browser test: `source/test/t29.py`.
- The subject must keep starting with "RosterPulse problem": the daily task searches Gmail for exactly that.

## Daily RosterPulse problem reports (scheduled task)
Created Nov 25 2026: 7:03 PM Central (CRON_TZ=America/Winnipeg 3 19 * * *), push notification only. Each evening it searches Gmail for `subject:"RosterPulse problem" newer_than:3d -label:RosterPulse-handled`. It sorts reports into clear bug, unclear and request. For clear bugs only, it fixes the source, builds the next test version, tests it at 390 and 1280 px and pushes it to `test/` (the test site). It never changes a Worker, never touches ShotPulse, never replies to or deletes email, and never builds requests. It labels what it read `RosterPulse-handled` and sends Jeff a short summary.

## Recent changes
- Nov 25: daily problem-report task created; both test reports (t29, t30) reached Jeff's inbox, t30 reads well in Gmail.
- nov25-t31: a player can have more than one position (tap all that apply); ranked and filtered in each; imports read "Setter/Outside"; Forward and Goalie gets both skill lists.
- nov25-t30: problem reports are typed in the app first; email laid out to survive lost line breaks.
- nov25-t29: Report a problem button.
- nov24-t28: Check for updates asks the server.
