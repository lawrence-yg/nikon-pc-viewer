// 出图：把构建产物里的某个内置示例自动载入，用 headless Chrome 截一张成品图。
// 用法：node shot.mjs [filmic|color|soft] [宽,高] [img]
//   末位写 img 时，再造一张灰阶渐变 JPG 喂给预览，把分隔线对比那块一起截进来。
// 只是给人眼复核用的，回归判定交给 ui-check.mjs。
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ART = new URL("./尼康优化校准查看器.html", import.meta.url);
const TMP = new URL("./.shot.html", import.meta.url);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const key = process.argv[2] || "color";
const size = process.argv[3] || "1240,1500";
const withImg = process.argv[4] === "img";
const out = new URL(`./shot-${key}${withImg ? "-preview" : ""}.png`, import.meta.url);

if (!existsSync(ART)) {
  console.error("没有构建产物，先跑 node build.mjs");
  process.exit(1);
}

/* 点一下示例按钮，等面板真的渲染出来再停 —— loadFile 是异步的，
   固定等待时间会在慢机器上截到空状态。 */
const inject = `
<script>
addEventListener("load", async function () {
  const b = document.querySelector('#samples button[data-s="${key}"]');
  if (!b) { document.title = "NO_SUCH_SAMPLE"; return; }
  b.click();
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const main = document.querySelector("#main");
    const side = document.querySelector("#side");
    if (main && !main.classList.contains("hidden") && side && side.children.length) break;
  }
  const st = document.createElement("style");
  st.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
  document.head.appendChild(st);
${withImg ? `
  const gc = document.createElement("canvas"); gc.width = 640; gc.height = 240;
  const gg = gc.getContext("2d");
  for (let x = 0; x < 640; x++) {
    const v = Math.round(x / 639 * 255);
    gg.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
    gg.fillRect(x, 0, 1, 240);
  }
  const jpg = await new Promise((r) => gc.toBlob(r, "image/jpeg", 0.95));
  loadImage(new File([jpg], "gray.jpg", { type: "image/jpeg" }));
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 20));
    if (state.img && !document.querySelector("#preview").classList.contains("hidden")) break;
  }
` : ""}
  document.title = document.querySelector("#main").classList.contains("hidden")
    ? "STILL_EMPTY" : "LOADED";
});
</script>`;

/* 注入到最后一个 </body>（产物脚本里可能有 "</body>" 字符串，不能 replace 第一个） */
const artSrc = readFileSync(ART, "utf8");
const at = artSrc.lastIndexOf("</body>");
writeFileSync(TMP, artSrc.slice(0, at) + inject + artSrc.slice(at));

const [w, h] = size.split(",");
spawnSync(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  "--virtual-time-budget=20000", `--window-size=${w},${h}`,
  `--screenshot=${out.pathname.replace(/^\//, "")}`, new URL(TMP).href,
], { stdio: "ignore" });

rmSync(TMP, { force: true });
console.log(existsSync(out) ? `已出图：${decodeURIComponent(out.pathname.split("/").pop())}` : "截图失败");
