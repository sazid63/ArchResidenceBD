// Browser UI checks (headless Chromium). Not installed with the app: run
//   npm i --no-save puppeteer-core @sparticuz/chromium && npm run dev   (in another terminal)
//   node scripts/tests/ui/ui-crawl.mjs            (UI_URL overrides http://localhost:3000)
// WebGL is stubbed out so the checks run without a GPU; this also exercises the "3D view could not start" path.
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core"; import fs from "fs";
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell", protocolTimeout: 30000 });
const routes = ["setup","projects","boq","assets","compliance","formwork","pour","rebar","connections","daylight","unit-mix","column-grid","fleet","windows","units","templates","about","help","licences","docs/drawings","design/final","phase/phase-site","design/phase-foundation"];
const sizes = { desktop: { width: 1366, height: 800 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const out = [];
for (const [name, vp] of Object.entries(sizes)) {
  const p = await b.newPage(); await p.setViewport(vp); await p.setBypassServiceWorker(true);
  await p.evaluateOnNewDocument(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; });
  let errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 100))); p.on("console", (m) => { if (m.type() === "error" && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text().slice(0, 100)); });
  for (const r of routes) {
    errs = [];
    try { await p.goto((process.env.UI_URL || "http://localhost:3000") + "/#/" + r, { waitUntil: "domcontentloaded" }); await new Promise((x) => setTimeout(x, 1500));
      const m = await p.evaluate(() => {
        const main = document.querySelector("main"); const vis = (e) => e.offsetWidth > 0 && e.offsetHeight > 0;
        const nm = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || e.getAttribute("alt") || e.getAttribute("placeholder") || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || e.closest("label")?.textContent || "").trim();
        const ctr = [...document.querySelectorAll("button,a[href],input,select,textarea")].filter(vis);
        const unl = ctr.filter((e) => !nm(e));
        const noBorderInputs = ctr.filter((e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== "checkbox" && e.type !== "radio" && e.type !== "range" && (parseFloat(getComputedStyle(e).borderTopWidth) === 0 || getComputedStyle(e).borderTopStyle === "none") && getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)").length;
        return { h: (main?.querySelector("h1,h2")?.textContent || "").trim().slice(0, 36), len: (main?.innerText || "").trim().length, ovX: document.documentElement.scrollWidth - innerWidth, unl: unl.length, unlSample: unl.slice(0, 2).map((e) => e.outerHTML.slice(0, 80)), plainInputs: noBorderInputs, title: document.title };
      });
      out.push({ name, r, ...m, errs: errs.slice(0, 2) });
      console.log(`${name.padEnd(7)} ${r.padEnd(24)} len=${String(m.len).padStart(6)} ovX=${String(m.ovX).padStart(4)} unl=${m.unl} plainInputs=${m.plainInputs} ${errs.length ? "ERR " + errs[0] : ""}${m.len < 80 ? " <-- EMPTY" : ""}`);
    } catch (e) { console.log(name, r, "FAILED", String(e).slice(0, 60)); }
  }
  await p.close();
}
fs.writeFileSync("report3.json", JSON.stringify(out, null, 1)); await b.close();
