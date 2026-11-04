# Ghar Ki Hawa (घर की हवा)

How dirty is the air inside your room today, and what is the cheapest thing that cleans it?
A free, open-source agent for Indian families in smog season, in English and Hindi.

**Status:** in development for [Code for a Billion 2026](https://codeforindia.org/hackathon)
(Code for India), track Climate. Not deployed yet. Scope, sources and the rules we follow are in
[BRIEF.md](BRIEF.md): every number on screen must come from a cited source or from the live
forecast, and the indoor estimate is always shown as a range, never as one number.

What it will do:

- Outdoor PM2.5 now and for the next 24 hours, with the CPCB National AQI category (CAMS forecast via Open-Meteo).
- The likely indoor range for your room as it is, with the windows closed, and with a purifier.
- The purifier size (CADR) your room needs, and the best hours to air it.
- A plan you can send on WhatsApp, and an anonymous public counter of plans made.

License: [MIT](LICENSE). Built in the AgentFoundry IDE.
