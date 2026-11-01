@echo off
rem 用 Edge 强制打开「构建产物」（双击关联程序可能指向别的应用）。
rem 用通配符而不是中文名：bat 被 cmd 按 GBK 解析，UTF-8 中文路径会乱码。
rem 根目录下唯一的 .html 就是成品；src/index.template.html 是构建模板，别开它。
setlocal
set "ART="
for %%f in ("%~dp0*.html") do set "ART=%%f"
if defined ART (
  start msedge "%ART%"
) else (
  echo.
  echo  [ERROR] viewer .html not found in this folder.
  echo  Run "npm run build" here first, then try again.
  echo.
  pause
)
