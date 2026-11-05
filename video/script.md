# Demo video script (Code for a Billion 2026, submission #51)

Promise: for a judge of the Climate track, this video shows the live app answering one Delhi
family's question in about 80 seconds, with every number traceable to the app or the README.
Viewer: evaluator, watches once, may be muted (all claims are also on screen).
Shape: product walkthrough, prints from the live app on a real phone (Redmi Note 14 Pro,
375x721), opened with `?nostats` so the recording never enters the public counter.
Render: `python3 ~/Dev/clauditor/skills/video-editing/scripts/demo_slides.py video/demo.json`.

| # | Visual | Narration (core) |
|---|--------|------------------|
| 1 | First screen of the app, title + question | Smog season in Delhi. A family asks: how dirty is the air inside my room today, and what is the cheapest thing that cleans it? |
| 2 | Room and purifier steps | Five short questions: place, room size, windows, purifier, and who lives there, which is optional and never stored. |
| 3 | Outdoor card | Outdoor PM2.5 now and over the next 24 hours, with the CPCB category and its health statement, word for word. |
| 4 | Indoor table | Inside the room it is always a range, never one number: as the room is kept, windows closed, and windows closed with a purifier. |
| 5 | CADR card + EPA fan box list | The clean air delivery rate the room needs for India's limit of 60 and the WHO guideline of 15, and the home-made fan and filter boxes the US EPA measured. |
| 6 | Same result in Hindi | One tap, and the whole plan is in Hindi. |
| 7 | Real output of `node --test tests/validation.test.mjs` | Check against PM2.5 measured in 8 Delhi homes (Kulshreshtha and Khare, 2011). A check of the ranges, not proof of use. |
| 8 | URL, free, open source | Free, open source, no ads, built for a cheap phone on 3G. |

Off screen: personal data, location permission prompts, any health promise.
Retention checkpoints after publish: 5 s (hook held), 30 s (reached the indoor range).
