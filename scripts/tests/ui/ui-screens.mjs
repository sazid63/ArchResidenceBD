// Browser UI checks (headless Chromium). Not installed with the app: run
//   npm i --no-save puppeteer-core @sparticuz/chromium && npm run dev   (in another terminal)
//   node scripts/tests/ui/ui-screens.mjs            (UI_URL overrides http://localhost:3000)
// WebGL is stubbed out so the checks run without a GPU; this also exercises the "3D view could not start" path.
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell", protocolTimeout: 30000 });
const res = []; const ok = (n, p, x = "") => { res.push(p); console.log(`${p ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage(); await p.setViewport({ width: 1366, height: 800 }); await p.setBypassServiceWorker(true);
await p.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
const go = async (h) => { await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/" + h, { waitUntil: "domcontentloaded" }); await wait(1600); };
const h1 = () => p.evaluate(() => document.querySelector("main h1,main h2")?.textContent || "");

await go("projects"); ok("My Projects route opens the projects screen", /project/i.test(await h1()) && !/NativeCAD/.test(await h1()), await h1());
await go("help");
await p.evaluate(() => [...document.querySelectorAll("main button")].find((x) => /column and beam/i.test(x.textContent))?.click()); await wait(700);
ok("Help: suggested question returns an answer with a source", await p.evaluate(() => /screening/i.test(document.body.innerText) && /App behaviour/.test(document.body.innerText)));
await p.click("#help-search-input"); await p.keyboard.down("Control"); await p.keyboard.press("a"); await p.keyboard.up("Control"); await p.keyboard.type("xyzzy nonsense"); await p.keyboard.press("Enter"); await wait(700);
ok("Help: unknown question says so instead of showing filler", await p.evaluate(() => /No answer in full help/i.test(document.body.innerText)));
await go("setup");
for (const [lbl, hash] of [["Templates", "templates"], ["Help", "help"], ["About", "about"]]) {
  await p.evaluate((l) => [...document.querySelectorAll("aside button")].find((x) => x.textContent.trim().startsWith(l))?.click(), lbl); await wait(500);
  ok(`sidebar "More" -> ${lbl}`, (await p.evaluate(() => location.hash)) === "#/" + hash);
}
await go("unit-mix");
const um = await p.evaluate(() => ({ vals: [...document.querySelectorAll('input[id^="unitmix-"]')].map((i) => +i.value), bw: parseFloat(getComputedStyle(document.querySelector('input[id^="unitmix-"]')).borderTopWidth), bc: getComputedStyle(document.querySelector('input[id^="unitmix-"]')).borderTopColor }));
ok("Unit Mix starts from the project (not all zero)", um.vals.some((v) => v > 0), JSON.stringify(um.vals));
ok("inputs have a visible border colour (theme variable defined)", um.bw > 0 && um.bc !== "rgba(0, 0, 0, 0)", um.bc);
await go("design/final");
const tree = await p.evaluate(() => ({ groups: document.querySelectorAll('[role="treeitem"]').length, rowsVisible: document.querySelectorAll(".cad-tree-row").length }));
ok("3D tree is grouped by element type and collapsed", tree.groups >= 5 && tree.rowsVisible < 60, JSON.stringify(tree));
ok("3D screen offers IFC export", await p.evaluate(() => /Export IFC/.test(document.body.innerText)));
ok("no page errors during checks", errs.length === 0, errs.join(";"));
await p.screenshot({ path: "scripts/audits/audit-out/ui-ux2-3d.png" });
await b.close(); console.log(res.every(Boolean) ? "\nALL UX2 CHECKS PASSED" : `\n${res.filter((x) => !x).length} FAILED`);
