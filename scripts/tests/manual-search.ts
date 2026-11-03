/** Help search quality: sensible questions find their answer, nonsense finds nothing. npm run test:manual */
import { searchManual, MANUAL_FAQ } from "../../src/data/manualFaq";
let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.log("FAIL", msg); } };
for (const e of MANUAL_FAQ) {
  for (const lang of ["en", "bn"] as const) {
    const r = searchManual(e.question[lang]);
    check(r[0]?.entry.id === e.id, `${lang} question for "${e.id}" ranks ${r[0]?.entry.id ?? "nothing"} first`);
  }
  check(!!e.answer.en && !!e.answer.bn && !!e.source, `entry ${e.id} lacks an answer in both languages or a source`);
  check(!/[\u0980-\u09FF][a-z]{3,}\b/.test(e.answer.bn + e.question.bn), `entry ${e.id} has stray Latin letters inside Bangla text`);
}
for (const junk of ["xyzzy nonsense", "qwerty", "zzzz", "", "   "]) check(searchManual(junk).length === 0, `"${junk}" should match nothing`);
check(searchManual("stair riser tread")[0]?.entry.id === "stairs", "stair keywords");
check(searchManual("setback")[0]?.entry.id === "setback", "setback keyword");
check(searchManual("কাঠা")[0]?.entry.id === "katha", "Bangla katha keyword");
console.log(failed ? `${failed} FAILED` : "manual search: all checks passed");
process.exit(failed ? 1 : 0);
