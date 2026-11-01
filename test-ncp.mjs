// 用真实 NCP 样本验证解析器，失败要退出码非 0
import { readFileSync } from "node:fs";
import { parseNcp, isNcp, hasSig } from "./src/ncp.js";

let bad = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "OK " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
};

const buf = new Uint8Array(readFileSync(new URL("./samples/Horshack_Linear.NCP", import.meta.url)));
const pc = parseNcp(buf);

console.log("=== 真实样本 Horshack_Linear.NCP ===");
check("容器签名", hasSig(buf));
check("识别为 NCP", isNcp(buf));
check("格式标记", pc.format === "ncp", pc.format);
check("版本", pc.version === "0100", pc.version);
check("名称", pc.name === "HS Linear v01", JSON.stringify(pc.name));
check("基准=中性", pc.base === "中性", `0x${pc.baseEnum.toString(16)}`);
check("记录表", JSON.stringify(pc.records) === '[{"id":1,"len":36},{"id":2,"len":578}]',
  JSON.stringify(pc.records));

// 这些字段名与早期版本不一致过（contrast/brightness 已确认是标志位，不是数值）
check("锐化字节", pc.sharpning === 130, String(pc.sharpning));
check("饱和度中性", pc.saturation === 128, String(pc.saturation));
check("色相中性", pc.hue === 128, String(pc.hue));
check("对比度是标志位", pc.contrastFlag === 1 && pc.contrast === undefined,
  `contrastFlag=${pc.contrastFlag}`);
check("非单色", pc.isMono === false);
check("未使用的字节为 0xFF",
  pc.monoFilter === 0xff && pc.toningType === 0xff && pc.toningAmount === 0xff);

const tc = pc.toneCurve;
console.log("\n=== 曲线记录 ===");
check("存在 record 2", !!tc);
check("曲线类型 0x49", tc.curveType === 0x49, "0x" + tc.curveType.toString(16));
check("输入输出范围 0~255",
  tc.range.minIn === 0 && tc.range.maxIn === 255 && tc.range.minOut === 0 && tc.range.maxOut === 255,
  JSON.stringify(tc.range));
check("gamma 1.0", tc.gamma === 1, String(tc.gamma));
check("控制点数 2", tc.points.length === 2, JSON.stringify(tc.points));
check("LUT 长度 256", tc.lut.length === 256);
check("LUT 单调不减", [...tc.lut].every((v, i, a) => i === 0 || v >= a[i - 1]));

let maxDev = 0;
for (let i = 0; i < 256; i++) maxDev = Math.max(maxDev, Math.abs(tc.lut[i] - i));
console.log(`\n  信息 与恒等曲线最大偏差 ${maxDev.toFixed(1)}；`);
console.log("        这个文件名叫 Linear，但控制点只有首尾两点、查找表明显压暗 ——");
console.log("        相机执行的是查找表，所以「Linear」不能按字面理解（界面上也照此说明）。");

console.log(bad ? `\n${bad} 项未通过` : "\n全部通过");
process.exit(bad ? 1 : 0);
