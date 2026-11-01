// 下载真实样本（NCP / NP3），用于实证格式
import { writeFileSync, mkdirSync } from "node:fs";

const files = [
  ["Horshack_Linear.NCP", "https://raw.githubusercontent.com/tvgenious89/nikon-pc/main/tests/fixtures/Horshack_Linear.NCP"],
  ["ClrMode_Bu_01a.NP3", "https://raw.githubusercontent.com/tvgenious89/nikon-pc/main/tests/fixtures/ClrMode_Bu_01a.NP3"],
];

mkdirSync(new URL("./samples/", import.meta.url), { recursive: true });

for (const [name, url] of files) {
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(name, "HTTP", res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(new URL(`./samples/${name}`, import.meta.url), buf);
    const hex = [...buf.slice(0, 24)].map((x) => x.toString(16).padStart(2, "0")).join(" ");
    console.log(`${name}: ${buf.length} 字节`);
    console.log(`  头: ${hex}`);
    console.log(`  ASCII: ${[...buf.slice(0, 4)].map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : ".")).join("")}`);
  } catch (e) {
    console.log(name, "失败:", String(e.message || e));
  }
}