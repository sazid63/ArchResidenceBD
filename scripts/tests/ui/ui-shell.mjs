// Browser UI checks (headless Chromium). Not installed with the app: run
//   npm i --no-save puppeteer-core @sparticuz/chromium && npm run dev   (in another terminal)
//   node scripts/tests/ui/ui-shell.mjs            (UI_URL overrides http://localhost:3000)
// WebGL is stubbed out so the checks run without a GPU; this also exercises the "3D view could not start" path.
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell", protocolTimeout: 30000 });
const results = []; const ok = (name, pass, extra = "") => { results.push(pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
async function mk(vp) {
  const p = await b.newPage(); await p.setViewport(vp); await p.setBypassServiceWorker(true);
  await p.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; window.__dialogs = 0; window.confirm = () => { window.__dialogs++; return false; }; });
  p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e).slice(0, 120)));
  p.on("console", (m) => { if (m.type() === "error" && /Hooks/.test(m.text())) p.errs.push("HOOKS"); });
  return p;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => (document.querySelector("main")?.innerText || "").length);
const click = (p, label) => p.evaluate((l) => { const e = [...document.querySelectorAll("nav button, aside button, header button")].find((x) => x.textContent.trim().startsWith(l)); e?.click(); return !!e; }, label);

// ---- desktop
let p = await mk({ width: 1366, height: 800 });
await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/boq", { waitUntil: "domcontentloaded" }); await wait(1800);
ok("deep link #/boq opens the BOQ", (await p.evaluate(() => document.querySelector("main h1,main h2")?.textContent || "")).includes("Bill of Quantities"));
await click(p, "Compliance"); await wait(700);
ok("navigation updates the URL hash", (await p.evaluate(() => location.hash)) === "#/compliance");
await p.goBack(); await wait(700);
ok("browser Back returns to the BOQ", (await p.evaluate(() => document.querySelector("main h1,main h2")?.textContent || "")).includes("Bill of Quantities"), await p.evaluate(() => location.hash));
await p.reload({ waitUntil: "domcontentloaded" }); await wait(1500);
ok("refresh keeps the current screen", (await p.evaluate(() => location.hash)) === "#/boq");
for (const [lbl, hash] of [["Formwork", "formwork"], ["Documents", "docs/drawings"]]) {
  await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/" + hash, { waitUntil: "domcontentloaded" }); await wait(1800);
  ok(`${lbl} screen renders (no hooks crash)`, (await text(p)) > 100 && !p.errs.length, p.errs.join(";"));
  p.errs = [];
}
await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/design/final", { waitUntil: "domcontentloaded" }); await wait(2200);
ok("3D screen explains missing WebGL", await p.evaluate(() => !!document.querySelector('[role="alert"]') && /3D view could not start/.test(document.body.innerText)));
ok("3D header says elements / RCC", await p.evaluate(() => /elements/.test(document.body.innerText) && /RCC/.test(document.body.innerText)));
await p.screenshot({ path: "scripts/audits/audit-out/ui-ux-desktop-3d.png" });
await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/boq", { waitUntil: "domcontentloaded" }); await wait(1500);
await click(p, "Delete"); await wait(400);
ok("delete opens an in-app dialog (no window.confirm)", await p.evaluate(() => !!document.querySelector('[role="alertdialog"]') && window.__dialogs === 0));
await p.keyboard.press("Escape"); await wait(300);
ok("Esc closes the dialog and keeps the project", await p.evaluate(() => !document.querySelector('[role="alertdialog"]') && /Sitalakshya|Stories/.test(document.body.innerText)));
ok("active nav item has aria-current", await p.evaluate(() => !!document.querySelector('[aria-current="page"]')));
await p.close();

// ---- phone
p = await mk({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/boq", { waitUntil: "domcontentloaded" }); await wait(1800);
const sb = await p.evaluate(() => { const r = document.querySelector("#app-sidebar").getBoundingClientRect(); return { right: r.right, mainW: document.querySelector("main").getBoundingClientRect().width }; });
ok("phone: drawer is closed and content uses full width", sb.right <= 1 && sb.mainW > 380, JSON.stringify(sb));
ok("phone: no horizontal scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await p.screenshot({ path: "scripts/audits/audit-out/ui-ux-phone-boq.png" });
await click(p, "☰"); await wait(500);
ok("phone: menu button opens the drawer", await p.evaluate(() => document.querySelector("#app-sidebar").getBoundingClientRect().left >= -1 && document.querySelector('[aria-label="Open menu"]').getAttribute("aria-expanded") === "true"));
await p.screenshot({ path: "scripts/audits/audit-out/ui-ux-phone-drawer.png" });
await click(p, "Compliance"); await wait(700);
ok("phone: choosing a screen closes the drawer", await p.evaluate(() => document.querySelector("#app-sidebar").getBoundingClientRect().right <= 1 && location.hash === "#/compliance"));
await p.close(); await b.close();
console.log(results.every(Boolean) ? "\nALL UX CHECKS PASSED" : `\n${results.filter((x) => !x).length} UX CHECKS FAILED`);
