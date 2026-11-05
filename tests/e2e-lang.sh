#!/bin/sh
# Live check through `browse`: switching the language keeps the DIY box the person chose. The result screen
# recomputes the plan from that box, so losing it changed the numbers. ?nostats keeps the run out of the
# public usage counter. Usage: tests/e2e-lang.sh [device] [url]
DEV=${1:-minipc}
URL=${2:-https://ghar-ki-hawa.designmaster.workers.dev/?nostats}
browse "$DEV" open "$URL" >/dev/null || exit 2
browse "$DEV" wait '#diy-list input' >/dev/null || exit 2
got=$(browse "$DEV" js "const box = () => document.querySelector('input[name=diy]:checked').value;
const now = () => document.documentElement.lang + ':' + box();
const lang = () => document.querySelector('#lang').click();
document.querySelector('input[name=diy][value=fan1]').click();
const a = now(); lang(); const b = now(); lang(); const c = now();
return [a, b, c].join(' ');") || exit 2
echo "$got"
[ "$(echo "$got" | grep -o ':fan1' | wc -l | tr -d ' ')" = 3 ] && echo "e2e lang ok" || { echo "FAIL: the DIY box changed with the language"; exit 1; }
