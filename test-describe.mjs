/* 解读模块的回归测试：测量 → 归类 → 锚点表 → 颜色句。
   （明暗的文字叙述已按用户决定移除，其定量信息由锚点表与曲线图承载；
    原针对叙述句的矛盾/越界不变量随 describeTone 一并移除，
    防矛盾结构现在由 classifyCurve 的优先级链与锚点表的逐行互斥承担。）
   盯的历史事故：肩部越界（251%）、负百分比、交点检测全错、
   趾部被误报成死黑、量化台阶虚高斜率、灰像素被色彩混合误伤。 */
import { analyzeTone, describeColor, classifyCurve, anchorTable } from "./src/describe.js";

let bad = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "OK " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
};

const lut256 = (f) => Uint8ClampedArray.from({ length: 256 }, (_, i) => f(i));

/* ---------- 合成曲线（参数已知） ---------- */
const curves = {
  identity: lut256((i) => i),
  // 整体提亮 + 压对比（gamma 0.82，与内置「重色彩」同族）
  lift: lut256((i) => 255 * Math.pow(i / 255, 0.82)),
  // filmic S（与内置「Filmic S 曲线」同公式：1.6 / 1.4）
  filmic: lut256((i) => {
    const x = i / 256;
    const s = x < 0.5 ? 0.5 * Math.pow(2 * x, 1.6) : 1 - 0.5 * Math.pow(2 * (1 - x), 1.4);
    return s * 255;
  }),
  // 哑光：黑位抬到 30、白位压到 225 的直线
  matte: lut256((i) => 30 + (i * (225 - 30)) / 255),
  // 死黑：底部 20 级贴 0（注意 i=20 处公式仍为 0，实为 21 级）
  crush: lut256((i) => (i < 20 ? 0 : ((i - 20) / (255 - 20)) * 255)),
  // 顶白：1.2 倍增益，213 级以后全部贴 255
  pegged: lut256((i) => Math.min(255, i * 1.2)),
  // 非单调：100~108 区间局部回落 8 级（色调断层来源）
  nonmono: lut256((i) => (i > 100 && i <= 108 ? i - 8 : i)),
};

const pct = (idx) => Math.round((idx / 255) * 100);

console.log("=== analyzeTone（测量）===");
{
  const a = analyzeTone(curves.filmic);
  check("中间调斜率 ≈1.3~1.6", a.bands.mid.gain > 1.3 && a.bands.mid.gain < 1.6, a.bands.mid.gain.toFixed(3));
  check("中间调比两端陡出余量", a.bands.mid.gain > a.bands.toe.gain + 0.15 && a.bands.mid.gain > a.bands.shoulder.gain + 0.15,
    `mid=${a.bands.mid.gain.toFixed(2)} toe=${a.bands.toe.gain.toFixed(2)} sh=${a.bands.shoulder.gain.toFixed(2)}`);
  check("肩部起点 = 解析解 91%", a.shoulderStart !== null && pct(a.shoulderStart) >= 85 && pct(a.shoulderStart) <= 95,
    a.shoulderStart === null ? "null" : String(pct(a.shoulderStart)));
  check("趾部起点落在 5~20%", a.toeStart !== null && pct(a.toeStart) >= 5 && pct(a.toeStart) <= 20,
    a.toeStart === null ? "null" : String(pct(a.toeStart)));
  check("恰好一个交点（中性灰）在 45~55%", a.crossings.length === 1 && pct(a.crossings[0]) >= 45 && pct(a.crossings[0]) <= 55,
    JSON.stringify(a.crossings));
  check("无死黑/顶白（S 曲线端点小台阶不算）", a.crushBlack === null && a.crushWhite === null);
  check("单调", a.monotonic === true);

  const m = analyzeTone(curves.matte);
  check("matte：黑位 30 / 白位 225", m.liftBlack === 30 && m.pegWhite === 225, `${m.liftBlack}/${m.pegWhite}`);
  check("matte：反差被压平且无趾肩", m.contrast < 0.9 && m.toeStart === null && m.shoulderStart === null, m.contrast.toFixed(3));

  const c = analyzeTone(curves.crush);
  check("crush：crushBlack = 20", c.crushBlack === 20, String(c.crushBlack));

  const p = analyzeTone(curves.pegged);
  check("pegged：crushWhite = 213", p.crushWhite === 213, String(p.crushWhite));

  const l = analyzeTone(curves.lift);
  check("lift：反差接近原样（0.9~1.0）", l.contrast > 0.9 && l.contrast < 1.0, l.contrast.toFixed(3));
  check("lift：无趾肩/裁切", l.toeStart === null && l.shoulderStart === null && l.crushBlack === null && l.crushWhite === null);
}

console.log("=== classifyCurve ===");
{
  check("恒等 → 线性（恒等）", /线性（恒等）/.test(classifyCurve(analyzeTone(curves.identity))));
  check("filmic → 标准S形（趾/直线/肩齐全）", /标准S形（趾部、直线部、肩部齐全）/.test(classifyCurve(analyzeTone(curves.filmic))),
    classifyCurve(analyzeTone(curves.filmic)));
  check("matte → 哑光型", /哑光型（黑位抬起、白位压住）/.test(classifyCurve(analyzeTone(curves.matte))));
  check("crush → 暗部裁切型", /暗部裁切型/.test(classifyCurve(analyzeTone(curves.crush))));
  check("pegged → 高光裁切型", /高光裁切型/.test(classifyCurve(analyzeTone(curves.pegged))));
  check("lift → 整体提亮型（伽马类）", /整体提亮型/.test(classifyCurve(analyzeTone(curves.lift))),
    classifyCurve(analyzeTone(curves.lift)));
  const nm = analyzeTone(curves.nonmono);
  check("非单调被检出且进原型", nm.monotonic === false && nm.regressions >= 1 &&
    /非单调/.test(classifyCurve(nm)), `回落 ${nm.regressions} 处`);
}

console.log("=== anchorTable ===");
{
  const a = analyzeTone(curves.filmic);
  const rows = anchorTable(curves.filmic, a);
  check("五锚点", rows.length === 5 && rows.map((r) => r.x).join() === "0,25,50,75,100");
  /* 解析值：lut[64]=42→16；lut[128]=128→50；lut[191]≈206→81 */
  check("filmic 输出值 ≈ 0/16/50/81/100", rows.map((r) => r.y).join() === "0,16,50,81,100",
    rows.map((r) => r.y).join());
  /* 段斜率（本锚点→下一锚点的实际均值）：
     0→25: 42/64=0.66 压缩；25→50: 86/64=1.34 增强；
     50→75: 78/63=1.24 增强；75→100: 49/64=0.77 压缩 */
  check("首行 = 端点 + 本段压缩（趾部可见）",
    /保持纯黑/.test(rows[0].note) && /至 25%：斜率 ×0\.66（压缩）/.test(rows[0].note), rows[0].note);
  check("25→50 增强 ×1.34", /至 50%：斜率 ×1\.34（增强）/.test(rows[1].note), rows[1].note);
  check("50→75 增强 ×1.24", /至 75%：斜率 ×1\.24（增强）/.test(rows[2].note), rows[2].note);
  check("75→100 压缩 ×0.77（肩部滚降）", /至 100%：斜率 ×0\.77（压缩）/.test(rows[3].note), rows[3].note);
  check("末行端点保持纯白", /保持纯白/.test(rows[4].note), rows[4].note);
  const ri = anchorTable(curves.identity, analyzeTone(curves.identity));
  check("恒等表全为 ×1.00", ri.slice(0, 4).every((r) => /×1\.00（接近线性）/.test(r.note)));
  const rc = anchorTable(curves.crush, analyzeTone(curves.crush));
  check("crush 端点标纯黑区间", /纯黑区间/.test(rc[0].note), rc[0].note);
}

console.log("=== describeColor ===");
{
  const full = {
    format: "np3",
    saturation: 15,
    colorBlender: {
      red: { hue: 12, chroma: 20, brightness: 8 }, orange: { hue: -8, chroma: 25, brightness: 10 },
      yellow: { hue: -15, chroma: -30, brightness: 0 }, green: { hue: 20, chroma: -25, brightness: -10 },
      cyan: { hue: 5, chroma: 15, brightness: 5 }, blue: { hue: -20, chroma: 30, brightness: -12 },
      purple: { hue: 10, chroma: 18, brightness: 0 }, magenta: { hue: -5, chroma: 12, brightness: 5 },
    },
    colorGrading: {
      highlights: { hue: 40, chroma: 25, brightness: 8 }, midTone: { hue: 180, chroma: 15, brightness: 0 },
      shadows: { hue: 250, chroma: 30, brightness: -10 }, blending: 65, balance: -15,
    },
  };
  const s = describeColor(full).join(" ");
  check("全局饱和度先说", s.startsWith("整体饱和度 +15。"), s.slice(0, 40));
  check("枚举全部八个色系（按幅度排序，蓝第一、洋红在列）",
    /色彩混合：蓝更艳更暗、橙更艳更亮、绿更灰更暗、黄更灰、红更艳更亮、青更艳更亮、紫更艳、洋红更艳更亮 —— 八个色系全部有调整/.test(s),
    (s.match(/色彩混合：[^。]*/) || ["(缺)"])[0]);
  check("只说艳/灰/亮/暗，不出现色相方向词", !/偏[暖冷]|偏移/.test(s));
  check("艳度不同号时不做整体判断", !/整体偏艳|整体偏灰/.test(s));
  check("分离色调带中间调与强度", /分离色调：高光偏橙（艳 \+25）、中间调偏青（艳 \+15）、阴影偏蓝（艳 \+30）/.test(s),
    (s.match(/分离色调[^。]*/) || ["(缺)"])[0]);
  check("混合/平衡数值入句", /混合 65、平衡 -15/.test(s));
  check("全零色彩 → 无颜色句", describeColor({ format: "np3", colorBlender: {}, colorGrading: {}, saturation: -3 }).length === 0);
  check("NCP → 无颜色句", describeColor({ format: "ncp" }).length === 0);
  const sep = { format: "np3", colorBlender: {}, colorGrading: { highlights: { hue: 40, chroma: -20 } } };
  check("负艳度说去色", /高光被去色（艳 -20）/.test(describeColor(sep).join(" ")));
  /* 同号多数 → 整体判断 */
  const warm = {
    format: "np3", saturation: 0,
    colorBlender: {
      red: { hue: 0, chroma: 20, brightness: 0 }, orange: { hue: 0, chroma: 15, brightness: 0 },
      yellow: { hue: 0, chroma: 10, brightness: 0 }, green: { hue: 0, chroma: 12, brightness: 0 },
      blue: { hue: 0, chroma: 30, brightness: 0 },
    },
    colorGrading: {},
  };
  check("艳度同号多数 → 整体偏艳", /整体偏艳/.test(describeColor(warm).join(" ")));
  /* 少数色系 → 全部点名 */
  const few = { format: "np3", colorBlender: { red: { hue: 0, chroma: 20, brightness: 5 } }, colorGrading: {} };
  check("≤3 个色系全部点名", /色彩混合：红更艳更亮 —— 共 1 个色系有调整/.test(describeColor(few).join(" ")));
}

console.log(bad ? `\n${bad} 项未通过` : "\n全部通过");
process.exit(bad ? 1 : 0);