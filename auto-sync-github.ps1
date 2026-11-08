# ============================================================================
# KennyDatabase 跨裝置雲端修改自動寫回 GitHub 同步腳本
# 當您在任何其他電腦、手機或平板修改網站內容時，雲端頻道會立即同步；
# 本腳本更可將最新雲端快照自動寫回 cloud_db.json 並推送至 GitHub 儲存庫。
# ============================================================================

$ErrorActionPreference = "SilentlyContinue"
Set-Location -Path $PSScriptRoot
$topic = "kenny_principal_db_v3_sync_cany1234"
$lastSyncedTime = ""

Write-Host "🟢 已啟動 KennyDatabase 跨裝置雲端 -> GitHub 自動同步服務..."

while ($true) {
    try {
        $resp = Invoke-WebRequest -Uri "https://ntfy.sh/$topic/json?poll=1&since=all" -UseBasicParsing
        if ($resp.StatusCode -eq 200 -and $resp.Content) {
            $text = if ($resp.Content -is [byte[]]) {
                [System.Text.Encoding]::UTF8.GetString($resp.Content)
            } else {
                [string]$resp.Content
            }
            $lines = $text -split "`n" | Where-Object { $_.Trim() -ne "" }
            for ($i = $lines.Count - 1; $i -ge 0; $i--) {
                $msg = $lines[$i] | ConvertFrom-Json
                if ($msg.event -ne "message") { continue }

                $jsonBody = $null
                if ($msg.attachment -and $msg.attachment.url) {
                    $attResp = Invoke-WebRequest -Uri $msg.attachment.url -UseBasicParsing
                    $jsonBody = if ($attResp.Content -is [byte[]]) {
                        [System.Text.Encoding]::UTF8.GetString($attResp.Content)
                    } else {
                        [string]$attResp.Content
                    }
                } elseif ($msg.message -and $msg.message.StartsWith("{")) {
                    $jsonBody = $msg.message
                }

                if ($jsonBody) {
                    $parsed = $jsonBody | ConvertFrom-Json
                    if ($parsed.updatedAt -and $parsed.updatedAt -ne $lastSyncedTime) {
                        $lastSyncedTime = $parsed.updatedAt
                        [System.IO.File]::WriteAllText("$PSScriptRoot\cloud_db.json", $jsonBody, [System.Text.Encoding]::UTF8)
                        git add cloud_db.json
                        $status = git status --porcelain cloud_db.json
                        if ($status) {
                            git commit -m "Auto-sync cloud database update ($lastSyncedTime)"
                            git push origin main
                            Write-Host "✅ 已自動將跨裝置雲端更新寫回 GitHub: $lastSyncedTime"
                        }
                    }
                    break
                }
            }
        }
    } catch {
        # 略過網路瞬斷
    }
    Start-Sleep -Seconds 20
}
