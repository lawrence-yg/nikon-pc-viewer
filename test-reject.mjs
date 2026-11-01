// 非法输入必须报错，不能被当成 NP3 解析出一堆乱码。
// 背景：vendored 的 NP3 解析库对任意缓冲区都不抛错（越界读出 NaN），
// 早先版本因此会把拖进来的 JPG 当成合法文件展示，界面里没有一句错误提示。
import { readFileSync } from "node:fs";
import { parseAny, isNcp, isNp3, hasSig } from "./src/ncp.js";

let bad = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "OK " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) bad++;
};
const R = (n) => new Uint8Array(readFileSync(new URL(`./samples/${n}`, import.meta.url)));

/* 会被误判成合法文件的常见输入 */
const noise = (len, seed = 37) => {
  const b = new Uint8Array(len);
  for (let i = 0; i < len; i++) b[i] = (i * seed + 11) & 0xff;
  return b;
};
const jpeg = noise(4096);
jpeg[0] = 0xff; jpeg[1] = 0xd8; jpeg[2] = 0xff; jpeg[3] = 0xe0;

const utf8 = (s) => {
  const e = new TextEncoder().encode(s);
  const b = new Uint8Array(2000);
  b.set(e);
  return b;
};
const zip = noise(3000);
zip[0] = 0x50; zip[1] = 0x4b; zip[2] = 3; zip[3] = 4;

console.log("=== 必须拒绝的输入 ===");
const rejects = [
  ["空的 Uint8Array", new Uint8Array(0)],
  ["只有 4 字节", new Uint8Array([0x4e, 0x43, 0x50, 0x00])],
  ["全零 2000 字节", new Uint8Array(2000)],
  ["伪装 JPG（够长）", jpeg],
  ["伪装 ZIP", zip],
  ["中文文本文件", utf8("这是一段普通文本，不是尼康优化校准文件。")],
  ["随机噪声", noise(1100)],
  ["签名对但记录类型未知", new Uint8Array([...[0x4e, 0x43, 0x50, 0], 0, 0, 0, 7, 0, 0, 0, 36, ...noise(64)])],
  ["NP3 记录头但名称是乱字节", (() => { const b = noise(1100); b.set([0x4e, 0x43, 0x50, 0, 0, 0, 1, 0], 0); b[24] = 0x01; b[25] = 0x02; return b; })()],
  ["NCP 记录头但长度不足 36", new Uint8Array([...[0x4e, 0x43, 0x50, 0], 0, 0, 0, 1, 0, 0, 0, 8, ...noise(64)])],
];
for (const [label, buf] of rejects) {
  let err = null;
  try {
    const pc = parseAny(buf, label);
    err = `没抛错，name=${JSON.stringify(String(pc.name).slice(0, 24))}`;
  } catch (e) { err = null; }
  check(label, err === null, err || "");
}

console.log("\n=== 识别函数不能自己打脸 ===");
for (const [name, buf] of [["Horshack_Linear.NCP", R("Horshack_Linear.NCP")], ["ClrMode_Bu_01a.NP3", R("ClrMode_Bu_01a.NP3")]]) {
  check(`${name} 有签名`, hasSig(buf));
  check(`${name} 两种识别不同时为真`, !(isNcp(buf) && isNp3(buf)));
}
check("NCP 样本识别为 NCP", isNcp(R("Horshack_Linear.NCP")));
check("NP3 样本识别为 NP3", isNp3(R("ClrMode_Bu_01a.NP3")));

console.log("\n=== 真实与内置样例必须都能解析 ===");
for (const name of ["Horshack_Linear.NCP", "ClrMode_Bu_01a.NP3", "demo-filmic.NP3", "demo-color.NP3", "demo-soft.NCP"]) {
  let pc = null, err = "";
  try { pc = parseAny(R(name), name); } catch (e) { err = String(e.message || e); }
  check(name, !!pc && !!pc.format && pc.format !== undefined, err);
  if (pc) check(`  ${name} 带 fileName`, pc.fileName === name, JSON.stringify(pc.fileName));
}
check("NCP 样本给出 ncp", parseAny(R("Horshack_Linear.NCP")).format === "ncp");
check("NP3 样本给出 np3", parseAny(R("ClrMode_Bu_01a.NP3")).format === "np3");

console.log(bad ? `\n${bad} 项未通过` : "\n全部通过");
process.exit(bad ? 1 : 0);
