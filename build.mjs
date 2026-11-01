// 把解析器、样例、CSS、JS 内联进单个 HTML
import { readFileSync, writeFileSync } from "node:fs";

const R = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const css = R("./src/app.css");

// NP3 解析库：去掉 ESM 导出，改为全局函数
const np3 = R("./src/parser-lib.mjs")
  .replace(/^export\s*\{[\s\S]*?\};?\s*$/m, "")
  .replace(/\bexport\s+(function|const|class|let)\s/g, "$1 ");

// 本地解析器：去掉 ESM 的 import 与 export，同样转为全局
const ncp = R("./src/ncp.js")
  .replace(/^import\s[^\n]*$/gm, "")
  .replace(/^export\s+(function|const|class|let)\s/gm, "$1 ");

const app = R("./src/app.js");

// 预览的色彩近似模拟（FAM_HUE 迁到这里，app.js 与它共用同一 script 标签）
const colorsim = R("./src/colorsim.js")
  .replace(/^export\s+(function|const|class|let)\s/gm, "$1 ");

// 解读模块：同样去掉 ESM 导出后拼进 APP 段
const describe = R("./src/describe.js")
  .replace(/^export\s+(function|const|class|let)\s/gm, "$1 ");

// 内联后必须是四个全局函数都在的单文件脚本，缺任何一个都说明剥离出了问题
for (const name of ["deserialize", "parseNcp", "isNcp", "parseAny"]) {
  if (!new RegExp(`function ${name}\\s*\\(`).test(np3 + ncp)) {
    throw new Error(`内联异常：找不到全局函数 ${name}`);
  }
}
for (const name of ["analyzeTone", "describeColor", "classifyCurve", "anchorTable"]) {
  if (!new RegExp(`function ${name}\\s*\\(`).test(describe)) {
    throw new Error(`内联异常：找不到解读函数 ${name}`);
  }
}
for (const name of ["simulateColor", "rgb2hsl", "hsl2rgb"]) {
  if (!new RegExp(`function ${name}\\s*\\(`).test(colorsim)) {
    throw new Error(`内联异常：找不到色彩模拟函数 ${name}`);
  }
}
for (const [name, code] of [["NP3", np3], ["NCP", ncp], ["APP", app], ["COLORSIM", colorsim], ["DESCRIBE", describe]]) {
  const left = code.match(/^\s*(import|export)\s/m);
  if (left) throw new Error(`${name} 内联后仍残留 ESM 关键字：${left[0].trim()}`);
}

// 样例文件 → base64 内嵌
const b64 = (f) => readFileSync(new URL(`./samples/${f}`, import.meta.url)).toString("base64");
const samples = JSON.stringify({
  filmic: b64("demo-filmic.NP3"),
  color: b64("demo-color.NP3"),
  soft: b64("demo-soft.NCP"),
});

const out = R("./src/index.template.html")
  .replace("/*__CSS__*/", () => css)
  .replace("/*__SAMPLES__*/", () => `const SAMPLES = ${samples};`)
  .replace("/*__PARSER__*/", () => np3 + "\n" + ncp)
  .replace("/*__APP__*/", () => app + "\n" + colorsim + "\n" + describe);

const dest = new URL("./尼康优化校准查看器.html", import.meta.url);
writeFileSync(dest, out);

console.log("构建完成");
console.log("体积:", (Buffer.byteLength(out) / 1024).toFixed(1), "KB");