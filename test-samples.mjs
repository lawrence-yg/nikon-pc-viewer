// 验证内置样例能被解析器正确读回（make-sample.mjs 写出去的值要能拿回来）
import { readFileSync } from "node:fs";
import { parseNcp } from "./src/ncp.js";
import { deserialize } from "nikon-flexible-color-picture-control";

let bad = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "OK " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
};
const R = (n) => new Uint8Array(readFileSync(new URL(`./samples/${n}`, import.meta.url)));
const mono = (lut) => [...lut].every((v, i, a) => i === 0 || v >= a[i - 1]);

console.log("=== demo-soft.NCP（自建）===");
const n = parseNcp(R("demo-soft.NCP"));
check("名称", n.name === "SoftContrast", JSON.stringify(n.name));
check("版本", n.version === "0100", n.version);
check("基准=中性", n.base === "中性", n.base);
check("锐化读回 132", n.sharpning === 132, String(n.sharpning));
check("饱和度读回 118", n.saturation === 118, String(n.saturation));
check("色相中性", n.hue === 128, String(n.hue));
check("曲线单调不减", mono(n.toneCurve.lut));
const L = n.toneCurve.lut;
check("黑位抬起（不是纯黑）", L[0] > 8, String(Math.round(L[0])));
check("白位压住（不是纯白）", L[255] < 245, String(Math.round(L[255])));
check("中间调基本不动", Math.abs(L[128] - 128) <= 8, String(Math.round(L[128])));
check("反差被压低", L[192] - L[64] < 128, `${Math.round(L[64])}→${Math.round(L[192])} 跨度 ${Math.round(L[192] - L[64])}`);

console.log("\n=== demo-filmic.NP3 ===");
const f = deserialize(R("demo-filmic.NP3"));
check("名称", f.name === "FilmicDemo", f.name);
check("注释", f.comment === "演示：暗部压暗、高光滚降的 filmic 曲线", JSON.stringify(f.comment));
check("锐化 1.5", f.sharpning === 1.5, String(f.sharpning));
check("中调锐化 -1", f.midRangeSharpning === -1, String(f.midRangeSharpning));
check("饱和度 -3", f.saturation === -3, String(f.saturation));
check("控制点 5 个", f.toneCurve.points.length === 5, String(f.toneCurve.points.length));
check("采样点 257 个", f.toneCurve.raw.length === 257, String(f.toneCurve.raw.length));
check("曲线单调不减", mono(f.toneCurve.raw));
check("含曲线时对比度归 0", f.contrast === 0 && f.highlights === 0 && f.shadows === 0,
  `${f.contrast}/${f.highlights}/${f.shadows}`);
check("无分色域调整", !Object.values(f.colorBlender).some((v) => v.hue || v.chroma || v.brightness));

console.log("\n=== demo-color.NP3 ===");
const c = deserialize(R("demo-color.NP3"));
check("名称", c.name === "ColorDemo", c.name);
check("饱和度 15", c.saturation === 15, String(c.saturation));
check("色彩混合.蓝", JSON.stringify(c.colorBlender.blue) === '{"hue":-20,"chroma":30,"brightness":-12}',
  JSON.stringify(c.colorBlender.blue));
check("色彩混合.黄", JSON.stringify(c.colorBlender.yellow) === '{"hue":-15,"chroma":-30,"brightness":0}',
  JSON.stringify(c.colorBlender.yellow));
check("色彩分级.阴影", JSON.stringify(c.colorGrading.shadows) === '{"hue":250,"chroma":30,"brightness":-10}',
  JSON.stringify(c.colorGrading.shadows));
check("色彩分级.混合/平衡", c.colorGrading.blending === 65 && c.colorGrading.balance === -15,
  `${c.colorGrading.blending}/${c.colorGrading.balance}`);

console.log(bad ? `\n${bad} 项未通过` : "\n全部通过");
process.exit(bad ? 1 : 0);
