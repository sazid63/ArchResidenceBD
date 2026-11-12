/**
 * Rules-of-Hooks audit with no extra dependencies.
 *
 * ESLint's react-hooks plugin cannot be installed here (@typescript-eslint/parser does not support
 * TypeScript 7), and TypeScript 7 has no JS compiler API, so the source is first normalised with
 * esbuild (types and JSX removed, one statement per line, fixed indentation) and then checked:
 *   - a hook call (useX) at the top level of a component/hook AFTER an early `return`, and
 *   - a hook call inside a top-level `if` / loop block.
 * Either makes React throw "Rendered more hooks than during the previous render" and the screen
 * goes blank. v2.4.4 found this in FormworkScaffoldScreen and DrawingsScreen.
 *
 *   npm run audit:hooks
 */
import { transformSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const HOOK = /\buse[A-Z0-9]\w*\s*\(/;
const COMPONENT_START =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*|use[A-Z]\w*)\s*\(|^(?:export\s+)?(?:const|let|var)\s+([A-Z]\w*|use[A-Z]\w*)\s*=\s*(?:\(|async\s*\(|[A-Za-z_]\w*\s*=>|memo\(|forwardRef\()/;

export function auditSource(fileName: string, text: string): string[] {
  let js: string;
  try {
    js = transformSync(text, { loader: fileName.endsWith("x") ? "tsx" : "ts", jsx: "transform", target: "es2022", minify: false, legalComments: "none" }).code;
  } catch (e) {
    return [`${fileName}: could not parse (${String(e).split("\n")[0]})`];
  }
  const lines = js.split("\n");
  const problems: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = COMPONENT_START.exec(lines[i]);
    if (!m) continue;
    const name = m[1] ?? m[2];
    // body = until the first line at column 0 that closes the declaration
    let end = i + 1;
    while (end < lines.length && !/^[})]/.test(lines[end])) end++;
    let earlyReturnAt = -1;
    for (let j = i + 1; j < end; j++) {
      const l = lines[j];
      const indent = l.length - l.trimStart().length;
      if (indent !== 2 || !l.trim()) continue;
      const t = l.trim();
      if (earlyReturnAt >= 0 && HOOK.test(t) && !/^(?:return|\/\/)/.test(t))
        problems.push(`${fileName} ${name}: hook call after the early return (compiled line ${earlyReturnAt + 1}): ${t.slice(0, 80)}`);
      if (/^if\s*\(/.test(t) || /^(?:for|while)\s*\(/.test(t)) {
        // inspect the block this statement opens
        let k = j + 1;
        const single = !t.endsWith("{");
        const block: string[] = single ? [t] : [];
        if (!single) while (k < end && !/^ {2}\}/.test(lines[k])) block.push(lines[k++]);
        if (block.some((b) => HOOK.test(b.trim()) && /^\s*(?:const|let|var)?\s*[\w[\]{}, ]*=?\s*use[A-Z]/.test(b) ))
          problems.push(`${fileName} ${name}: hook called inside a condition/loop (compiled line ${j + 1})`);
        if (earlyReturnAt < 0 && block.some((b) => /^\s*return\b/.test(b) || /\)\s*return\b/.test(b))) earlyReturnAt = j;
      }
    }
  }
  return problems;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

if (process.argv[1] && /hooks-audit\.ts$/.test(process.argv[1])) {
  const files = walk("src");
  const problems = files.flatMap((f) => auditSource(f, fs.readFileSync(f, "utf8")));
  problems.forEach((p) => console.log("HOOK VIOLATION", p));
  console.log(problems.length ? `\n${problems.length} violation(s) in ${files.length} files` : `hooks audit: no violations in ${files.length} files`);
  process.exit(problems.length ? 1 : 0);
}
