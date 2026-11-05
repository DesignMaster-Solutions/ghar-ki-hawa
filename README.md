# Ghar Ki Hawa (घर की हवा)

How dirty is the air inside my room today, and what is the cheapest thing that cleans it?
A free, open-source helper for Indian families in smog season, in English and Hindi, built for a
cheap phone on 3G.

Built for [Code for a Billion 2026](https://codeforindia.org/hackathon), track **Climate**. Live at
<https://ghar-ki-hawa.designmaster.workers.dev> (anonymous usage numbers: [/stats](https://ghar-ki-hawa.designmaster.workers.dev/stats));
submission: [issue #51](https://github.com/karlmehta/code-for-a-billion/issues/51).
Demo video (82 s): <https://youtu.be/s7i_64pBx-w> (script and sources of every frame in [video/](video/)).
Scope, rules and the verified sources are in [BRIEF.md](BRIEF.md): every number on screen comes
from a cited source or from the live forecast, and an indoor estimate is always a low-high range,
never one number.

## What it does

One question per screen: place (city search or "use my location") → room size (feet or metres,
or a preset: small bedroom 10×10×9 ft, living room 14×16×10 ft, classroom 20×25×10 ft) → windows
(closed / open / opened a few times a day) → purifier (none / bought, with the CADR from the label
in cfm or m3/h / home-made fan box from the US EPA list) → who lives there (optional, never stored
or sent). The result card shows:

- Outdoor PM2.5 now and over the next 24 hours, with the CPCB category and the CPCB health
  statement, verbatim (in Hindi, followed by our own translation, marked as such).
- The likely indoor range now and over the next 24 hours: as you keep the room, with windows
  closed, and with windows closed plus a purifier (yours, or one of the EPA size if you have none).
- The purifier CADR the room needs to reach 60 ug/m3 (India 24-hour limit) and 15 ug/m3 (WHO
  24-hour guideline), plus the EPA "two-thirds of the floor area" rule.
- The best 2 hours to air the room (lowest outdoor forecast in the next 24 hours).
- EPA fan safety lines when a fan box is chosen.
- "Send on WhatsApp" (`wa.me` with the plan text) and "Did it work?": two optional monitor readings,
  before and after, saved only as two numbers and the day.
- "How we estimate": the equation, every assumption with its range and its source.

Static page (`index.html`, `styles.css`, `app.js`, `i18n.js`, `model.js`, `result.js`,
`cities.js`, `openmeteo.js`), no framework, about 72 KB uncompressed. One Cloudflare Worker
(`worker.js`) serves `/api/*`:

- `GET /api/forecast?city=<id>` answers from a cache that an hourly Cron Trigger (`7 * * * *`)
  fills with one Open-Meteo request for all 54 cities in `cities.js` (Open-Meteo accepts
  comma-separated coordinates). `?lat=&lon=` outside the list is rounded to 2 decimals and goes
  straight to Open-Meteo with a 10 s timeout; it is never stored. If the Worker is absent, the page
  calls Open-Meteo directly.
- `POST /api/event` (events `plan`, `share`, `feedback`; language `en`/`hi`; for feedback two
  readings 0-2000) and `GET /api/stats`, held in one Durable Object so increments are atomic.
  Public numbers: `/stats`.

## Run it

Requirements: Node.js 20+.

```sh
npm test              # same as: node --test (model, strings, result card, Worker)
npx wrangler dev      # app + API at http://localhost:8787
# cron locally:  npx wrangler dev --test-scheduled, then
#                curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=7+*+*+*+*"
```

The tests include a guard: they render every string in both languages and every result card
variant, and fail if an indoor estimate ever appears as a single number without its range.

## Sources for every number

- **Indoor model**, steady state with no indoor source: C_in = P × a × C_out ÷ (a + k + CADR ÷ V).
  Xiang J. et al., "Field measurements of PM2.5 infiltration factor and portable air cleaner
  effectiveness during wildfire episodes in US residences", Sci. Total Environ. 773 (2021) 145642,
  doi:10.1016/j.scitotenv.2021.145642, Eq. 2. Measured in 7 homes with windows closed: air exchange
  0.30-1.41 /h, deposition 0.10-0.49 /h; one home with windows open: 6.77 /h.
- **Penetration P 0.7-1.0, deposition k 0.2-0.6 /h**: Cao Y., Frey H.C., Atmospheric Environment 45
  (2011) 5684, doi:10.1016/j.atmosenv.2011.07.034.
- **Delhi homes**: Liao J. et al., IJERPH 16 (2019) 1391, doi:10.3390/ijerph16081391, modelled air
  exchange 1.5 /h annual mean, 3.3 /h with 1 m2 of windows open all day, k 0.19 /h. A simulation,
  not a field measurement.
- **Ranges used** (adjustable assumptions, from the three papers above): P 0.7-1.0; k 0.1-0.6 /h;
  a closed 0.3-1.5 /h; a open 3.3-6.8 /h; "opened a few times a day" = 2 h open + 22 h closed,
  time-weighted (our assumption). Low end = low P, low a, high k; high end = high P, high a, low k.
- **CPCB National AQI (2014)**, PM2.5 24-hour breakpoints 0-30 Good, 31-60 Satisfactory,
  61-90 Moderately polluted, 91-120 Poor, 121-250 Very poor, >250 Severe, and the health statement
  per category from the CPCB AQI bulletin
  (https://cpcb.gov.in//upload/Downloads/Delhi-NCR/NCR_AQI_Bulletin_2026_10_29.pdf). The statements
  are written for the AQI; we map the PM2.5 breakpoints to the same categories.
- **Limits**: India NAAQS 2009 (CPCB) PM2.5 24 h 60 ug/m3, annual 40; WHO Air Quality Guidelines
  2021 PM2.5 24 h 15 ug/m3, annual 5.
- **Purifier sizing**: AHAM / US EPA, "Guide to Air Cleaners in the Home", 2nd ed. 2018
  (https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home): CADR (cfm) at least 2/3 of
  the floor area (sq ft). 1 cfm = 1.699 m3/h.
- **Fan boxes**: US EPA, "Research on DIY Air Cleaners to Reduce Wildfire Smoke Indoors"
  (https://www.epa.gov/air-research/research-diy-air-cleaners-reduce-wildfire-smoke-indoors),
  wildfire smoke CADR: box fan + one 1-inch MERV 13 filter 111 ± 1 cfm; + cardboard shroud 156 ± 4;
  one 4-inch MERV 13 + shroud 248 ± 15; two 1-inch MERV 13 + shroud 263 ± 22; Corsi-Rosenthal box,
  four 1-inch MERV 13 + shroud 401 ± 31. "EPA cannot assure these results are representative of all
  scenarios." Fan safety lines quoted from the same page. No prices.
- **Burden**: India State-Level Disease Burden Initiative Air Pollution Collaborators, Lancet
  Planetary Health 2021; 5: e25-e38, doi:10.1016/S2542-5196(20)30298-9: 1.67 million deaths in 2019
  (95% UI 1.42-1.92), 17.8% of all deaths; ambient particulate matter 0.98 million, household air
  pollution 0.61 million, ambient ozone 0.17 million. Same paper: lost output from premature deaths
  and illness cost US$36.8 billion in 2019 (95% UI 27.4-47.7), 1.36% of India's GDP, and Delhi had
  the highest per-capita economic loss of any state; the population-weighted mean PM2.5 exposure
  was 91.7 ug/m3 (95% UI 69.6-113.9).
- **People exposed**: same collaborators, Lancet Planetary Health 2019; 3: e26-e39,
  doi:10.1016/S2542-5196(18)30261-4: in 2017, 76.8% of India's population lived with an annual
  population-weighted mean PM2.5 above the national limit of 40 ug/m3; Delhi, Uttar Pradesh, Bihar
  and Haryana all averaged above 125 ug/m3; 51.4% of the deaths attributable to air pollution were
  in people younger than 70.
- **Forecast**: Open-Meteo Air Quality API, CAMS global forecast, hourly pm2_5 and pm10
  (https://open-meteo.com/en/docs/air-quality-api). Free for non-commercial use under 10,000
  calls/day with CC BY 4.0 attribution (https://open-meteo.com/en/terms); this tool has no ads and
  no subscriptions. Shown on screen: "Air quality forecast: CAMS via Open-Meteo (CC BY 4.0)".

## Checked against measurements in Delhi homes

`tests/validation.test.mjs` runs the model against the PM2.5 measured inside and outside 8 Delhi
homes: Kulshreshtha P., Khare M., "Indoor exploratory analysis of gaseous pollutants and respirable
particulate matter at residential homes of Delhi, India", Atmospheric Pollution Research 2 (2011)
337-350, doi:10.5094/APR.2011.038, Table 5 (GRIMM 1.107 monitors in the kitchen and outside,
10:00-16:00, 3 days a week in summer and in winter).

- **Summer**, ventilation rated "Good" to "Excellent" (Table 2): the 7 homes without a reported
  indoor source had indoor/outdoor ratios of 0.71 to 0.97. All 7 fall inside the tool's
  windows-open range, 0.59 to 0.99. The 8th (1.80) the authors tie to an indoor source.
- **Winter**, doors and windows shut: 7 of 8 kitchens had 1.13 to 5.64 times the outdoor PM2.5,
  which the authors tie to cooking fuel (wood and dung cakes at one site), incense, cleaning and
  children playing indoors. A model with no indoor source can never pass 1, so the screen now
  says so with these numbers: in a home that cooks on solid fuel or burns incense, the range is a
  floor, not a ceiling.
- The test was seen failing on a changed model: with P capped at 0.8 or k at least 0.4 per hour,
  measured homes fall outside the range.

Eight kitchens, daytime only, is a small sample. It checks the ranges; it does not replace a
monitor in your room.

## Checked against measured outdoor PM2.5 in Delhi (backtest)

Does "the best 2 hours to air the room" pick cleaner air than the real alternatives? We replayed
the app on every day of October and November 2022, 2023, 2024 and 2025 (the smog seasons):

- **Measured**: hourly PM2.5 from the U.S. Department of State monitor in New Delhi (AirNow site
  DS1010001, "U.S. Department of State India - New Delhi"), read from the public OpenAQ archive,
  location 8118 (`openaq-data-archive` on S3, no key).
- **What the app would have seen**: the Open-Meteo Air Quality archive of CAMS PM2.5 for the same
  point, the source the app uses live.
- Each day the app is opened at 07:00 IST and `bestAiringHours()` from `model.js`, unchanged, picks
  2 consecutive hours from the next 24 hours of CAMS. We then look at what the monitor measured in
  those 2 hours and compare with the daytime mean (06:00-22:00), with airing out of habit at
  08:00-10:00 or 18:00-20:00, and with the 2 hours that really were the cleanest (the ceiling).
  Days with a missing measured hour in the pick, or fewer than 12 measured daytime hours, are
  left out (233 of 244 days remain).

| Season | Days | App picks | Daytime mean 06-22 h | App vs daytime | Best 2 h (measured) | Share of best cut | App vs 08-10 h | App vs 18-20 h | Picks 00-05 h |
|---|---|---|---|---|---|---|---|---|---|
| Oct-Nov 2022 | 60 | 92 | 116 | -21%, lower on 52/60 days | 68 | 50% | -38%, 50/60 | -13%, 50/60 | 6 |
| Oct-Nov 2023 | 60 | 123 | 149 | -18%, lower on 52/60 days | 97 | 51% | -36%, 51/59 | -15%, 51/60 | 3 |
| Oct-Nov 2024 | 60 | 109 | 148 | -27%, lower on 58/60 days | 93 | 72% | -44%, 55/60 | -16%, 49/58 | 2 |
| Oct-Nov 2025 | 53 | 94 | 127 | -27%, lower on 50/53 days | 79 | 70% | -45%, 46/51 | -15%, 43/52 | 4 |
| **All** | 233 | 104 | 135 | -23%, lower on 212/233 days | 85 | 61% | -40%, 202/230 | -15%, 193/230 | 15 |

"App picks", "Daytime mean" and "Best 2 h" are measured PM2.5 in ug/m3. "Share of best cut" is how
much of the gap between the daytime mean and the cleanest 2 measured hours the app's pick closed.

What it shows: the app's 2 hours were 23% cleaner than the daytime average and 40% cleaner than
airing at 08:00-10:00, and beat both on about 9 of 10 days. Against 18:00-20:00 the gain is smaller,
15%, and the app's pick was not cleaner on 37 of 230 days. It gets about 61% of the way to the perfect choice. Where
it is wrong: on 21 of 233 days its 2 hours were no cleaner than the daytime average, and because it does
not limit the hours, it sent people to air the room between 01:00 and 05:00 on 15 of the 233 days
(once at 23:00). Most picks land in the early afternoon: 129 of the 233 start at 14:00.

Everything is in [evidence/backtest/](evidence/backtest/): one CSV per day (hour, measured, CAMS),
`fetch.mjs` that rebuilds them, and `backtest.mjs` that prints this table.
`tests/backtest.test.mjs` recomputes it from the CSVs and fails if this README disagrees; it was
seen failing with `bestAiringHours` turned to pick the dirtiest hours.

Limits of this check: Open-Meteo has no "as issued" air quality series (`pm2_5_previous_day1` is
empty for these dates), so the backtest uses the archived CAMS series, which can be better than
the forecast a family saw that morning. One monitor stands for the whole city, and it is outdoor
air, not the air in a room. CAMS reads lower than the monitor here (on average 87 against 150
ug/m3, 0.58 times), so the outdoor numbers the app shows in smog season are likely low; the ranking
of hours, which is what the pick uses, held up. OpenAQ stamps each hourly mean at the end of its
hour; the CSVs store it at the start, the way the app labels its hours.

## Limits

- The model is a steady-state estimate for one room. It does not include indoor sources such as
  cooking, incense, mosquito coils or smoking, which raise the real level; it assumes the outdoor
  forecast is right for your street. In Delhi's smog season the CAMS forecast read about 0.58
  times the measured outdoor PM2.5 (backtest above).
- The ranges come from US field measurements and one Delhi simulation, checked against one Delhi
  field study (above). They are assumptions, shown as low-high, not a measurement of your home. A monitor reading beats the estimate.
- City coordinates are city centres; "use my location" within about 25 km of a listed city uses
  that city's forecast.
- The Hindi text was written by an AI agent and needs review by a native speaker before wide use.

## How it was built

In the **AgentFoundry IDE**: the folder was opened in AgentFoundry and **Claude Code** was run from
the AgentFoundry integrated terminal against `BRIEF.md`. Claude Code read the brief and its verified
sources, wrote the pure model and its tests first (`node --test`), then the bilingual strings and
result builder with the "no single indoor number" guard, the Worker with the forecast cache, cron
and counter, the UI, and this README, committing each step with conventional commits. Before that run, the open "TO VERIFY" items of
the brief (equation, P/a/k ranges, DIY box measurements, CPCB text, Open-Meteo terms) were looked up
in the published sources and appended to `BRIEF.md`. After it, the model was mutation-checked (each
edge test seen failing on a changed limit), deployed to Cloudflare Workers and checked on a real phone.

## License

MIT, see [LICENSE](LICENSE).
