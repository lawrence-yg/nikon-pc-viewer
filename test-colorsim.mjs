/* 预览色彩模拟的回归测试：用合成像素断言"参数→效果"。
   盯的事故：灰像素被色彩混合误伤（灰没有色系归属）、染色方向反了、
   负艳度不去色反而加色、色相被混合偷偷转动、无色彩数据时输出被改动。 */
import { simulateColor, rgb2hsl } from "./src/colorsim.js";

let bad = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "OK " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
};

const px = (r, g, b) => ({ data: new Uint8ClampedArray([r, g, b, 255]), width: 1, height: 1 });
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const run = (img, pc) => { simulateColor(img, pc); return img.data; };

/* pc 构造器：只写关心的字段 */
const np3 = (o = {}) => ({ format: "np3", saturation: 0, colorBlender: {}, colorGrading: {}, ...o });
const blend = (k, c, b = 0) => ({ colorBlender: { [k]: { hue: 0, chroma: c, brightness: b } } });
const grade = (zone, hue, c, b = 0) => ({ colorGrading: { [zone]: { hue, chroma: c, brightness: b } } });

console.log("=== 色彩混合 ===");
{
  const out = run(px(128, 128, 128), np3(blend("red", 50)));
  check("灰像素对色彩混合免疫", eq(out, [128, 128, 128]), `${out[0]},${out[1]},${out[2]}`);

  const img = px(200, 110, 100);
  const [h0] = rgb2hsl(200, 110, 100);
  const o2 = run(px(200, 110, 100), np3(blend("red", 50)));
  const [h1, s1] = rgb2hsl(o2[0], o2[1], o2[2]);
  const [, s0] = rgb2hsl(200, 110, 100);
  check("艳度 +50 → 饱和度上升", s1 > s0 + 0.1, `${s0.toFixed(2)} -> ${s1.toFixed(2)}`);
  check("混合不转动色相", Math.abs(h1 - h0) <= 2, `${h0.toFixed(1)} -> ${h1.toFixed(1)}`);

  const o3 = run(px(80, 120, 200), np3(blend("blue", 0, -30)));
  const lum = (d) => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  check("蓝系明度 -30 → 变暗", lum(o3) < lum([80, 120, 200]), `${lum([80, 120, 200]).toFixed(1)} -> ${lum(o3).toFixed(1)}`);

  /* 远离该色系的像素几乎不受影响（绿像素 + 红系调整） */
  const o4 = run(px(100, 160, 90), np3(blend("red", 50)));
  const spread = (d) => Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
  check("色相距离衰减：绿像素几乎不吃红的调整", Math.abs(spread(o4) - spread([100, 160, 90])) < 6,
    `${spread([100, 160, 90])} -> ${spread(o4)}`);
}

console.log("=== 整体饱和度 ===");
{
  const o = run(px(200, 110, 100), np3({ saturation: 40 }));
  const spread = (d) => Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
  check("彩像素展宽变大", spread(o) > spread([200, 110, 100]), `${spread([200, 110, 100])} -> ${spread(o)}`);
  const g = run(px(128, 128, 128), np3({ saturation: 40 }));
  check("灰像素不受饱和度影响", eq(g, [128, 128, 128]), `${g[0]},${g[1]},${g[2]}`);
}

console.log("=== 色彩分级 ===");
{
  const o = run(px(40, 40, 40), np3(grade("shadows", 250, 50)));
  check("暗部染 250°：偏蓝", o[2] > o[0] && o[2] > o[1], `${o[0]},${o[1]},${o[2]}`);

  const o2 = run(px(230, 230, 230), np3(grade("highlights", 40, 50)));
  check("高光染 40°：偏暖", o2[0] > o2[2], `${o2[0]},${o2[1]},${o2[2]}`);

  const o3 = run(px(150, 60, 60), np3(grade("shadows", 0, -50)));
  const spread = (d) => Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
  check("负艳度 → 该区去色", spread(o3) < spread([150, 60, 60]), `${spread([150, 60, 60])} -> ${spread(o3)}`);

  /* 中灰落在中间调：阴影/高光的染色都不该碰到它 */
  const o4 = run(px(128, 128, 128), np3(grade("shadows", 250, 60)));
  const o5 = run(px(128, 128, 128), np3(grade("highlights", 40, 60)));
  check("区权重互斥：中灰不吃阴影/高光染色", eq(o4, [128, 128, 128]) && eq(o5, [128, 128, 128]),
    `${o4[0]},${o4[1]},${o4[2]} / ${o5[0]},${o5[1]},${o5[2]}`);

  const o6 = run(px(40, 40, 40), np3(grade("shadows", 0, 0, -20)));
  const lum = (d) => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  check("暗部明度 -20 → 变暗", lum(o6) < 40, `${lum(o6).toFixed(1)}`);
}

console.log("=== 整体行为 ===");
{
  const img = px(200, 110, 100);
  const before = [...img.data];
  const o = run(px(200, 110, 100), np3());
  check("无色彩数据 → 输出逐字节不变", eq(o, before));
  const ncpOut = run(px(200, 110, 100), { format: "ncp", saturation: 118, colorBlender: {}, colorGrading: {} });
  check("NCP 不做色彩模拟", eq(ncpOut, before));

  /* 通道值必须落在 0~255（ImageData 会夹，但公式本身也不该靠夹保平安） */
  const o2 = run(px(250, 250, 40), np3({ saturation: 80, ...blend("yellow", 60, 30), ...grade("highlights", 55, 60, 30) }));
  check("极端参数下通道仍合法",
    o2.every((v, i) => i === 3 || (v >= 0 && v <= 255)), `${o2[0]},${o2[1]},${o2[2]}`);
}

console.log(bad ? `\n${bad} 项未通过` : "\n全部通过");
process.exit(bad ? 1 : 0);