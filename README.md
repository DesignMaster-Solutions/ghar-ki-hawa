# Ghar Ki Hawa (घर की हवा)

How dirty is the air inside my room today, and what is the cheapest thing that cleans it?
A free, open-source helper for Indian families in smog season, in English and Hindi, built for a
cheap phone on 3G.

Built for [Code for a Billion 2026](https://codeforindia.org/hackathon), track **Climate**. Live at
<https://ghar-ki-hawa.designmaster.workers.dev> (anonymous usage numbers: [/stats](https://ghar-ki-hawa.designmaster.workers.dev/stats));
submission: [issue #51](https://github.com/karlmehta/code-for-a-billion/issues/51).
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

## Limits

- The model is a steady-state estimate for one room. It does not include indoor sources such as
  cooking, incense, mosquito coils or smoking, which raise the real level; it assumes the outdoor
  forecast is right for your street.
- The ranges come from US field measurements and one Delhi simulation. They are assumptions, shown
  as low-high, not a measurement of your home. A monitor reading beats the estimate.
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
