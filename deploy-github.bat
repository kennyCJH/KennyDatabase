@echo off
chcp 65001 >nul
echo ============================================================================
echo   KennyDatabase 國小校長知識庫與治校策略系統 - GitHub 自動更新與發布工具
echo ============================================================================
echo.

cd /d "%~dp0"

if not exist ".git" (
    echo [1/3] 尚未初始化 Git，正在為您初始化本地儲存庫...
    git init
    git branch -M main
    echo.
    set /p REPO_URL="請貼上您在 GitHub 建立的 Repository 網址 (例如 https://github.com/您的帳號/KennyDatabase.git): "
    git remote add origin "%REPO_URL%"
)

echo [2/3] 正在打包最新網頁修改...
git add .
git commit -m "Update KennyDatabase portal (%date% %time%)"

echo [3/3] 正在推送至 GitHub...
git push -u origin main

echo.
echo ✅ 更新完成！若已開啟 GitHub Pages，約 30~60 秒後您的個人網站即會完成更新。
pause
