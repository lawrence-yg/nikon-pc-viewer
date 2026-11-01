// 生成内置演示样例：2 个 NP3 + 1 个 NCP
// NCP 是按已验证的结构手工构造的，能生成说明格式理解正确。
import { serialize } from "nikon-flexible-color-picture-control";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync(new URL("./samples/", import.meta.url), { recursive: true });

const enc = new TextEncoder();
const save = (name, buf) => {
  writeFileSync(new URL(`./samples/${name}`, import.meta.url), buf);
  console.log(`  ${name}  ${buf.length} 字节`);
};

/* ---------- NP3：filmic S 曲线 ---------- */
const sCurve = Array.from({ length: 257 }, (_, i) => {
  const x = i / 256;
  const s = x < 0.5
    ? 0.5 * Math.pow(2 * x, 1.6)
    : 1 - 0.5 * Math.pow(2 * (1 - x), 1.4);
  return Math.round(Math.min(1, Math.max(0, s)) * 32767);
});

save("demo-filmic.NP3", serialize({
  name: "FilmicDemo",
  comment: "演示：暗部压暗、高光滚降的 filmic 曲线",
  sharpning: 1.5, midRangeSharpning: -1, clarity: 0.5, saturation: -3,
  toneCurve: {
    raw: sCurve,
    points: [{ x: 0, y: 0 }, { x: 64, y: 44 }, { x: 128, y: 134 }, { x: 192, y: 222 }, { x: 255, y: 255 }],
  },
}));

/* ---------- NP3：重色彩 ---------- */
const liftCurve = Array.from({ length: 257 }, (_, i) => {
  const x = i / 256;
  const s = 0.5 * Math.pow(2 * x, 0.82);   // 整体提亮 + 压对比
  return Math.round(Math.min(1, Math.max(0, s)) * 32767);
});

save("demo-color.NP3", serialize({
  name: "ColorDemo",
  comment: "演示：色彩混合与色彩分级拉满",
  sharpning: 0.5, saturation: 15,
  colorBlender: {
    red: { hue: 12, chroma: 20, brightness: 8 },
    orange: { hue: -8, chroma: 25, brightness: 10 },
    yellow: { hue: -15, chroma: -30, brightness: 0 },
    green: { hue: 20, chroma: -25, brightness: -10 },
    cyan: { hue: 5, chroma: 15, brightness: 5 },
    blue: { hue: -20, chroma: 30, brightness: -12 },
    purple: { hue: 10, chroma: 18, brightness: 0 },
    magenta: { hue: -5, chroma: 12, brightness: 5 },
  },
  colorGrading: {
    highlights: { hue: 40, chroma: 25, brightness: 8 },
    midTone: { hue: 180, chroma: 15, brightness: 0 },
    shadows: { hue: 250, chroma: 30, brightness: -10 },
    blending: 65, balance: -15,
  },
  toneCurve: { raw: liftCurve, points: [{ x: 0, y: 0 }, { x: 255, y: 255 }] },
}));

/* ---------- NCP：手工构造 ---------- */
function buildNcp({ name, base = 0x03c2, sharpning = 128, saturation = 128, hue = 128, lut }) {
  // record 1（36 字节）
  const r1 = new Uint8Array(36);
  r1.set(enc.encode("0100"), 0);                       // 版本（ASCII）
  r1.set(enc.encode(name.slice(0, 19)), 4);            // 名称
  r1[24] = (base >> 8) & 0xff; r1[25] = base & 0xff;   // 基准枚举
  r1[26] = 0x00; r1[27] = 0xff;
  r1[28] = sharpning;
  r1[29] = 1;                                            // 对比度标志
  r1[30] = 1;                                            // 亮度标志
  r1[31] = saturation;
  r1[32] = hue;
  r1[33] = 0xff; r1[34] = 0xff; r1[35] = 0xff;

  // record 2（578 字节）
  const r2 = new Uint8Array(578);
  r2[0] = 0x49; r2[1] = 0x30;
  r2[2] = 0x00; r2[3] = 0xff;                           // 输入范围 0~255
  r2[4] = 0x00; r2[5] = 0xff;                           // 输出范围 0~255
  r2[6] = 1; r2[7] = 0;                                 // gamma = 1.00
  r2[8] = 2;                                             // 控制点数
  r2[9] = 0; r2[10] = 0;                                 // 点 0→0
  r2[11] = 255; r2[12] = 255;                           // 点 255→255
  for (let i = 0; i < 256; i++) {                       // offset 66 起：256 项 u16
    const v = Math.round(Math.min(1, Math.max(0, lut[i])) * 32767);
    const p = 66 + i * 2;
    r2[p] = (v >> 8) & 0xff; r2[p + 1] = v & 0xff;
  }

  const total = 4 + 8 + 36 + 8 + 578 + 4;
  const out = new Uint8Array(total);
  let o = 0;
  out.set(enc.encode("NCP\0"), o); o += 4;
  const putRec = (id, payload) => {
    out[o++] = (id >>> 24) & 0xff; out[o++] = (id >>> 16) & 0xff;
    out[o++] = (id >>> 8) & 0xff; out[o++] = id & 0xff;
    const L = payload.length;
    out[o++] = (L >>> 24) & 0xff; out[o++] = (L >>> 16) & 0xff;
    out[o++] = (L >>> 8) & 0xff; out[o++] = L & 0xff;
    out.set(payload, o); o += L;
  };
  putRec(1, r1);
  putRec(2, r2);
  out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; // 结束标记
  return out;
}

/* 「柔和反差」要真的把反差压低：整体向中间调压缩（斜率 < 1），
   黑位抬起来、白位压下去，再叠一点正弦避免纯直线。导数 0.86±0.02π 恒正，保持单调。 */
const softCurve = Array.from({ length: 256 }, (_, i) => {
  const x = i / 255;
  return 0.5 + (x - 0.5) * 0.86 + 0.02 * Math.sin(Math.PI * x);
});

save("demo-soft.NCP", buildNcp({
  name: "SoftContrast",
  base: 0x03c2,        // 中性
  sharpning: 132,
  saturation: 118,
  hue: 128,
  lut: softCurve,
}));

console.log("完成");