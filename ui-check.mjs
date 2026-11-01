// 浏览器端回归检查：把构建产物喂给 headless Chrome，断言界面行为，跑完自动清理。
// 覆盖 node 侧测不到的部分：读数框定位、空色彩表、垃圾文件的报错文案、字体与 viewport。
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ART = new URL("./尼康优化校准查看器.html", import.meta.url);
const TMP = new URL("./.ui-check.html", import.meta.url);
const CHROME = process.env.CHROME
  || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const PAGE = `
<script>
window.__ERR=[];
window.onerror=function(m,s,l,c){__ERR.push(String(m)+" @"+l+":"+c);};
addEventListener("unhandledrejection",function(e){__ERR.push("reject: "+(e.reason&&e.reason.message||e.reason));});
var wait=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
function until(pred,limit){limit=limit||80;return new Promise(function(res,rej){
  var n=0;(function step(){ if(pred())return res(true);
    if(++n>limit)return rej(new Error("等待超时"));
    setTimeout(step,25);})();});}
function text(sel){var e=document.querySelector(sel);return e?e.innerText.replace(/\\s+/g," ").trim():"(缺 "+sel+")";}

async function run(){
  var out={pass:[],fail:[]};
  var t=function(name,ok,detail){(ok?out.pass:out.fail).push(name+(detail?" — "+detail:""));};

  var cv=document.querySelector("#curve"), ro=document.querySelector("#readout");

  t("无脚本错误", window.__ERR.length===0, window.__ERR.join(" | "));
  t("有 viewport", !!document.querySelector('meta[name="viewport"]'));
  var bf=getComputedStyle(document.body);
  t("正文优先用本机思源/Noto 黑体", /^"?Noto Sans SC"?/.test(bf.fontFamily), bf.fontFamily.split(",")[0]);
  t("关闭字体合成", bf.fontSynthesis.indexOf("none")>=0 || bf.fontSynthesis==="weight style", bf.fontSynthesis);
  t("图例写的是控制点", /控制点/.test(text(".legend")), text(".legend"));

  var expect={filmic:"FilmicDemo",color:"ColorDemo",soft:"SoftContrast"};
  for (var key in expect) {
    document.querySelector('.swap button[data-s="'+key+'"]').click();
    await until(function(){return state.pc && state.pc.name===expect[key];});
    var side=text("#side");
    t("示例 "+key+" 面板同步", side.indexOf(expect[key])===0, side.slice(0,24));
    t("示例 "+key+" 带文件名", !!state.pc.fileName, state.pc.fileName);
  }

  // FilmicDemo 没有分色域调整：左栏色彩卡显示说明而非色块，右栏不出现混合表
  document.querySelector('.swap button[data-s="filmic"]').click();
  await until(function(){return state.pc && state.pc.name==="FilmicDemo";});
  var side=text("#side");
  t("无色彩调整时左栏给出说明", /没有分色域调整/.test(text("#colorCards")), text("#colorCards").slice(0,60));
  t("无色彩调整时不列 Color Blender 表",
    side.indexOf("色彩混合（Color Blender）")<0, side.slice(0,60));
  t("无色彩调整时表格数<=2", document.querySelectorAll("#side table").length<=2,
    String(document.querySelectorAll("#side table").length));

  // 解读卡（瘦身版）：只含色彩句与曲线类型；锚点表已迁到曲线卡片
  var interp=text(".interpret");
  t("解读卡存在且含曲线类型", document.querySelector("#side .interpret")!==null&&/曲线类型：/.test(interp), interp.slice(0,60));
  t("filmic 解读 = 曲线类型（无色彩句时不再有明暗叙述）",
    /曲线类型：标准S形/.test(interp) && !/反差明显增强|中性灰基本不变/.test(interp), interp.slice(0,80));
  var arows=document.querySelectorAll(".plot .anchor tr");
  t("锚点表在曲线卡片内（表头+5行）", arows.length===6 && /至 100%：斜率 ×[\\d.]+（压缩）/.test(arows[4]?arows[4].innerText:""),
    "rows="+arows.length);
  t("锚点表数值与悬停读数同源", Math.abs(state.lut[64]/255*100-16)<1, "lut[64]="+(state.lut[64]/255*100).toFixed(1));

  // 读数框必须贴在曲线卡片里，而不是整页右上角
  var card=document.querySelector(".plot");
  var br=card.getBoundingClientRect();
  var cr=cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:cr.left+cr.width*0.5,clientY:cr.top+cr.height*0.5}));
  await wait(30);
  var rr=ro.getBoundingClientRect();
  var inCard=rr.left>=br.left&&rr.right<=br.right+1&&rr.top>=br.top&&rr.bottom<=br.bottom+1;
  t("悬浮读数框在曲线卡片内", inCard&&ro.style.display==="block",
    ro.textContent+" readout="+Math.round(rr.left)+","+Math.round(rr.top)+" card="+Math.round(br.left)+","+Math.round(br.top)+","+Math.round(br.right));
  t("读数框的定位祖先是卡片而非页面", ro.offsetParent===card,
    ro.offsetParent?String(ro.offsetParent.className):"null");
  t("读数框没贴着整页右上角", rr.top>40&&rr.left<window.innerWidth-20,
    Math.round(rr.left)+","+Math.round(rr.top));
  cv.dispatchEvent(new PointerEvent("pointerleave",{bubbles:true}));
  await wait(20);
  t("移出后读数框隐藏", ro.style.display==="none", ro.style.display);

  // NCP 的半格调节不能被夸大成整格
  document.querySelector('.swap button[data-s="soft"]').click();
  await until(function(){return state.pc && state.pc.name==="SoftContrast";});
  var sideText=text("#side");
  t("NCP 每格=4 的说明在面板里", /每格 = 4/.test(sideText));
  t("偏差值标了 0~255 刻度", /与恒等最大偏差（0~255）/.test(sideText),
    (sideText.match(/与恒等最大偏差（0~255） ?[\\d.]+/) || ["(缺)"])[0]);
  t("NCP 也有解读卡", document.querySelector("#side .interpret")!==null);

  // 照片预览：这是最容易在重构里悄悄坏掉的一块
  var gc=document.createElement("canvas"); gc.width=200; gc.height=60;
  var gg=gc.getContext("2d");
  for (var x=0;x<200;x++){ gg.fillStyle="rgb("+x+","+x+","+x+")"; gg.fillRect(x,0,1,60); }
  var blob=await new Promise(function(r){gc.toBlob(r,"image/jpeg",0.95);});
  loadImage(new File([blob], "gray.jpg", {type:"image/jpeg"}));
  await until(function(){return !!state.img;});
  t("预览出图", !document.querySelector("#preview").classList.contains("hidden"));
  var px=function(sel){return document.querySelector(sel).getContext("2d").getImageData(100,30,1,1).data;};
  var b0=px("#pvBase"), b1=px("#pv");
  t("效果图与原图不同（曲线生效）", b0[0]!==b1[0], b0[0]+" -> "+b1[0]);
  t("预览就是图上那条曲线", Math.abs(b1[0]-state.lut[b0[0]])<=1,
    "输入 "+b0[0]+" 输出 "+b1[0]+" 曲线表 "+state.lut[b0[0]]);
  var cvBefore=pvCache.cv;
  var pvEl=document.querySelector("#preview");
  var pr=pvEl.getBoundingClientRect();
  pvEl.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:pr.left+pr.width*0.6,clientY:pr.top+10}));
  pvEl.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:pr.left+pr.width*0.25,clientY:pr.top+10}));
  pvEl.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));
  await wait(30);
  var clip=document.querySelector("#pv").style.clipPath||"";
  var pct=parseFloat(document.querySelector("#pvHandle").style.left)||0;
  t("拖动分隔线只改裁切、不重算像素",
    pvCache.cv===cvBefore&&pvCache.dirty===false&&/inset/.test(clip)&&Math.abs(pct-25)<1,
    clip+" 分隔线="+pct+"% dirty="+pvCache.dirty);
  document.querySelector('.swap button[data-s="filmic"]').click();
  await until(function(){return state.pc && state.pc.name==="FilmicDemo";});
  await wait(50);
  t("换配置后效果图缓存重建", pvCache.cv!==cvBefore&&pvCache.dirty===false,
    "cv 变了="+(pvCache.cv!==cvBefore)+" dirty="+pvCache.dirty);

  // 垃圾文件必须走错误分支，且提示仍然可继续拖：构造一个够长的伪装 JPEG
  var junk=new Uint8Array(4096);
  junk[0]=0xFF;junk[1]=0xD8;junk[2]=0xFF;junk[3]=0xE0;
  for(var q=4;q<junk.length;q++)junk[q]=(q*37)&0xFF;
  await loadFile(new File([junk], "假文件.jpg"));
  await until(function(){return /读不了/.test(text("#empty"));});
  var em=text("#empty");
  t("垃圾文件被拒绝", document.querySelector("#main").classList.contains("hidden"));
  t("错误文案带上文件名", /假文件\\.jpg/.test(em), em.slice(0,70));
  t("报错后拖拽提示没被吃掉", /把 \\.NCP 或|拖到这里/.test(em), em.slice(0,40));

  // 换文件后没有残留上一条的读数
  document.querySelector('.swap button[data-s="color"]').click();
  await until(function(){return state.pc && state.pc.name==="ColorDemo";});
  t("切换示例后读数框不残留", ro.style.display!=="block", ro.style.display);
  t("color 解读含分离色调", /分离色调/.test(text(".interpret")), text(".interpret").slice(0,90));
  var ci=text(".interpret");
  t("color 解读色彩句在前（首段是色彩，曲线类型垫后）",
    /整体饱和度|色彩混合/.test(document.querySelector(".interpret p").innerText) &&
    ci.indexOf("曲线类型")>ci.indexOf("分离色调"), ci.slice(0,70));
  t("color 解读枚举全部色系", /色彩混合：/.test(ci)&&/更艳|更灰|更亮|更暗/.test(ci)&&/洋红/.test(ci)&&/八个色系全部有调整/.test(ci),
    (ci.match(/色彩混合：[^。]{0,70}/)||["(缺)"])[0]);
  t("色彩卡在左栏（混合+分级两组色块）",
    document.querySelectorAll("#colorCards .swgrid").length===2 &&
    document.querySelectorAll("#colorCards .switem").length===11,
    "swgrid=" + document.querySelectorAll("#colorCards .swgrid").length);
  var folds=document.querySelectorAll("#colorCards details.colorfold");
  t("色彩合并为一张折叠卡且默认折叠", folds.length===1 && !folds[0].open, "details="+folds.length);
  folds[0].querySelector("summary").click();
  await wait(40);
  var opened=folds[0].open;
  folds[0].querySelector("summary").click();
  await wait(40);
  t("点标题展开/再点整组收起", opened && !folds[0].open, "opened="+opened);
  t("右栏不再有色彩色块卡", text("#side").indexOf("色彩混合（Color Blender）")<0, text("#side").slice(0,60));

  // 预览色彩近似：ColorDemo 暗部应被染向 250°（偏蓝），底图仍是纯灰阶
  var pdAt=document.querySelector("#pvBase").getContext("2d").getImageData(25,30,1,1).data;
  var ptAt=document.querySelector("#pv").getContext("2d").getImageData(25,30,1,1).data;
  t("预览色彩近似生效（暗部染蓝）",
    ptAt[2]>ptAt[0]&&pdAt[0]===pdAt[1]&&pdAt[0]===pdAt[2],
    "pv rgb="+ptAt[0]+","+ptAt[1]+","+ptAt[2]);
  t("预览说明提到色彩近似", /近似/.test(text(".card .note")), text(".card .note").slice(0,60));

  // 有自定义曲线时对比度等五项是结构性 0，应当压暗而不是与真实数值同权重
  var trs=[].slice.call(document.querySelectorAll("#side table tr"));
  var z=trs.filter(function(r){var h=r.querySelector("th");return h&&h.innerText.trim()==="对比度";})[0];
  var zd=z?z.querySelector("td"):null;
  var zc=zd?(zd.innerText.trim()+"/"+zd.className):"(找不到行)";
  t("结构性 0 压暗显示", !!zd&&zd.innerText.trim()==="0"&&/\\bna\\b/.test(zd.className), zc);

  t("运行期间无错误", window.__ERR.length===0, window.__ERR.join(" | "));
  var p=document.createElement("pre");p.id="UICHECK";p.textContent=JSON.stringify(out);document.body.appendChild(p);
}
window.addEventListener("load",function(){run().catch(function(e){
  var p=document.createElement("pre");p.id="UICHECK";
  p.textContent=JSON.stringify({pass:[],fail:["探针自身失败: "+(e&&e.stack||e)]});
  document.body.appendChild(p);
});});
<\/script>
`;

if (!existsSync(ART)) {
  console.error("没有构建产物，先跑 node build.mjs");
  process.exit(1);
}

/* 注入点必须是【最后一个】</body>：产物脚本里可能有自己的 "</body>" 字符串
   （比如模板守卫的指路 HTML），replace 第一个会把探针插进字符串字面量里。 */
const art = readFileSync(ART, "utf8");
const anchor = art.lastIndexOf("</body>");
if (anchor < 0) {
  console.error("产物里没有 </body>，文件可能损坏。");
  process.exit(1);
}
writeFileSync(TMP, art.slice(0, anchor) + PAGE + art.slice(anchor));

const res = spawnSync(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  "--virtual-time-budget=20000", "--window-size=1280,1600",
  "--dump-dom", new URL(TMP).href,
], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

rmSync(TMP, { force: true });

let report = null;
const m = (res.stdout || "").match(/<pre id="UICHECK">([\s\S]*?)<\/pre>/);
if (m) {
  report = JSON.parse(m[1]
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

if (!report) {
  console.error("Chrome 没有返回检查结果（页面未加载或超时）。");
  console.error(String(res.stderr || "").slice(0, 600));
  process.exit(1);
}

for (const p of report.pass) console.log("  OK   " + p);
for (const f of report.fail) console.log("  FAIL " + f);
console.log(report.fail.length ? `\n${report.fail.length} 项未通过` : `\n全部通过（${report.pass.length} 项）`);
process.exit(report.fail.length ? 1 : 0);
