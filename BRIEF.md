# Ghar Ki Hawa — brief (Code for a Billion 2026, track Climate)

Goal: a free, open-source agent that tells a family in a smog-season Indian city how dirty the air
inside their room is likely to be today and tomorrow, and the cheapest action that brings it down
(windows, when to air the room, purifier size, a do-it-yourself filter box), in English and Hindi,
on a cheap phone.

Why this one: SkyWatch (issue #35, the only other Climate entry on 04/11/2026) already tells people
which OUTDOOR hours are cleaner and how much of the smoke is from farm fires. Nothing in the hub
covers the place where people spend most of the day: indoors. This is the protection layer.

## Facts we may use (cite each one in the README; nothing else is a fact)

- Burden: 1.67 million deaths in India in 2019 attributable to air pollution, 17.8% of all deaths
  (India State-Level Disease Burden Initiative Air Pollution Collaborators, Lancet Planetary Health
  2021; 5: e25-e38). Quote the paper's own split between ambient PM and household pollution.
- Limits: India NAAQS 2009 (CPCB) PM2.5 24-hour 60 ug/m3, annual 40 ug/m3. WHO 2021 Air Quality
  Guidelines PM2.5 24-hour 15 ug/m3, annual 5 ug/m3.
- CPCB National AQI (2014) PM2.5 24-hour breakpoints: 0-30 Good, 31-60 Satisfactory,
  61-90 Moderately polluted, 91-120 Poor, 121-250 Very poor, >250 Severe. Use CPCB's own health
  statement per category, verbatim, with the source.
- Purifier sizing: AHAM / US EPA "Guide to Air Cleaners in the Home" (2nd ed., 2018): CADR (cfm)
  at least 2/3 of the room area (sq ft), which is about 5 air changes per hour at an 8 ft ceiling.
  Show it in m3/h too (1 cfm = 1.699 m3/h).
- Indoor model: steady-state mass balance with no indoor source,
  C_in = P * a * C_out / (a + k + CADR / V), with P = penetration, a = air exchange rate (1/h),
  k = deposition rate (1/h), V = room volume (m3). TO VERIFY before coding: a published source for
  the equation and for default ranges of P, a (closed vs open window, Indian homes if any exists) and
  k for PM2.5. If no source, show the defaults as adjustable assumptions and always print the
  low/high range, never one number.
- Outdoor forecast: Open-Meteo Air Quality API (CAMS global forecast), hourly pm2_5 and pm10,
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=..&longitude=..&hourly=pm2_5,pm10&timezone=Asia%2FKolkata`,
  free, no key, attribution "CAMS via Open-Meteo" on screen. TO VERIFY: Open-Meteo terms for a
  non-commercial open-source tool.
- DIY filter box (fan + filters taped into a box): TO VERIFY with a published measurement (peer
  reviewed or a lab test) before any claim of how much it removes; prices only with a dated link to a
  real listing, or no price at all. Fan safety advice only from a cited source.

Not allowed: invented numbers, health claims beyond CPCB/WHO text, "clinically proven", brand
endorsements, any paid API, any tracking beyond the anonymous counter below.

## Build

- Static web app (index.html + app.js + i18n en/hi), no framework, < 100 KB, works on 3G; one
  Cloudflare Worker for the forecast cache (hourly cron for the ~50 largest Indian cities, so the
  page answers even if Open-Meteo is slow) and the anonymous counter.
- Flow, one step per screen: place (search or location) -> room (length x width x height, or
  presets: small bedroom, living room, classroom) -> windows (closed / open / opened a few times a
  day) -> purifier (none / commercial with CADR from the label / DIY box) -> who lives there (child
  under 5, over 60, asthma or COPD, heart disease, pregnant; optional, never stored).
- Result card: outdoor PM2.5 now and next 24 h with the CPCB category; estimated indoor range now
  and next 24 h for "as is", "windows closed" and "with purifier"; the CADR the room needs to reach
  60 and 15 ug/m3; the best 2 hours to air the room; a WhatsApp share text.
- model.js = pure functions (naqiCategory, indoorSteadyState, cadrNeeded, bestAiringHours) with
  `node --test` tests: category edges (30/31, 60/61, 250/251), mass-balance limits (CADR 0 equals
  infiltration only; huge CADR goes to ~0), unit conversion, and a test that fails if any text shows
  a single indoor number without its range.
- /stats page and /api/stats JSON like Nyaya Sahayak: plans made, shares, by language and day; no
  personal data. "Did it work?" button: user types a monitor reading before/after (optional), saved
  only as two numbers and the date, shown on /stats. This is the Proven impact evidence.
- README: setup, sources for every number, how AgentFoundry was used, MIT license.

## AgentFoundry requirement (eligibility)

Build inside the AgentFoundry IDE (0.1.80 in /Applications, login info@designmastersolutions.com,
vault `agentfoundry:dms`): open this folder in AF and run Claude Code from the AF terminal against
this brief, as Nyaya Sahayak was built (Impressora R144, 29/10/2026). Decline the AF migration
wizard (it offers to import paid OpenAI/Gemini keys).

## Submission (issue form `submission.yml` in karlmehta/code-for-a-billion)

Title "[Submission] Ghar Ki Hawa (Design Master Solutions)", track Climate, team Alan De Bortolo
(@alandebortolo), repo + live URL, problem statement, what you built (and how AF was used),
scale and severity with the sources above, deployment and impact data with the /stats link.
Deadline: deployed and filed before 15/11/2026; target 08/11/2026. Winners 05/12/2026.

## Judging (JUDGING.md, 25% each)

Size of the problem, Severity, Quality of the solution, Proven impact (also the tie-breaker).
Prizes are per track: 1st Rs 1,50,000, 2nd Rs 1,00,000, 3rd Rs 50,000 (codeforindia.org/hackathon).
