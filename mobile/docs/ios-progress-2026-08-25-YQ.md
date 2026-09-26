# iOS 正式版功能清單（v1.3.0）

目前 iOS 正式版為 `1.3.0 (4)`，支援 iPhone，最低系統版本為 iOS 16.4。

## 錄音與本地轉寫

- 支援 iPhone 即時錄音及本地語音轉文字。
- 支援匯入音訊檔案後進行本地轉寫。
- 錄音或轉寫完成後可命名並儲存為 Note。
- 錄音期間會保持螢幕喚醒。
- 進入背景、鎖屏或遇到系統音訊中斷時會暫停錄音，返回後由使用者手動繼續。
- 錄音接近兩小時上限時會顯示提醒，到達上限後自動結束。

## Note 與 Workspace 管理

- 建立、重新命名及刪除 Workspace。
- 建立、重新命名、移動及刪除 Note。
- 支援 Note 置頂及取消置頂。
- 支援批量移動、批量移至 Trash、批量 Pin 及 Unpin。
- Note 儲存後可自動分類，也可由使用者手動修改分類。
- 支援依分類篩選 Note。
- 支援搜尋標題、Transcript、Structured Note 和 Knowledge result。
- 搜尋支援關鍵字及有限的錯字模糊比對。

## Structured Note 與 Task

- 可由 Transcript 產生摘要、重點、Task 和 Calendar intent。
- Structured Note 生成失敗時可重新嘗試。
- Home 顯示 Note 數量、置頂內容、字數及未完成 Task 概覽。
- Task 可完成、恢復及置頂，並可開啟來源 Note。
- 支援 daily、weekdays、weekly、biweekly 和 monthly 週期 Task。
- 完成週期 Task 後會建立下一個有效 occurrence。

## Ask AI

- 使用手機上的本地 LLM 回答 Note 內容相關問題。
- 一次可選擇 1 至 3 篇 Note 作為回答依據。
- 支援中文和英文 Note 問答。
- 對話、問題、回答和所選 Note context 會儲存在本地資料庫。
- 可恢復歷史對話或建立新對話。
- Ask AI 生成期間會顯示等待狀態，離開頁面後可恢復目前對話。

## Knowledge

- 提供 Meeting、Lecture、Consultation、Interview、Brainstorm 和 General 等 Knowledge scenario。
- 可建立、編輯及刪除自訂 Knowledge template。
- 可使用 template 從 Note 產生 Knowledge result。
- 每次成功生成的結果會保留獨立歷史快照。
- 修改或刪除 template 不會改寫已儲存的舊結果。
- 可單獨刪除不再需要的 Knowledge result。

## 本地 TTS

- 可朗讀 Ask AI 回答、Structured Note 和 Knowledge result。
- 長內容會分段生成並逐步播放，不需要等待全文完成。
- 支援暫停、續播及停止。
- 進入背景或鎖屏時會自動暫停，返回後由使用者手動續播。
- 開始錄音、轉寫或其他本地模型推理前，會先停止目前的語音播放。

## 本地模型管理

- 可在 AI Management 中下載、啟用及移除 STT、LLM 和 TTS 模型。
- 模型下載會顯示進度。
- 下載前會檢查裝置可用儲存空間。
- 模型下載失敗或取消後可重新下載。
- 已啟用的模型會在 App 重新啟動後保持啟用狀態。

## Theme 與介面

- 支援 Light、Dark 和 System 三種 Theme。
- Theme 選擇會儲存在本地並於下次啟動時恢復。
- 提供 Home、Workspaces、AI 和 Settings 四個底部 Tab。
- 底部導覽、Home Indicator、狀態列、靈動島及彈窗安全區已針對 iPhone 適配。

## Trash 與本地資料

- Settings 提供統一 Trash。
- Note、Workspace、Ask AI conversation 和自訂 Knowledge template 可移至 Trash。
- 移至 Trash 後可復原，也可由使用者確認後永久刪除。
- 一般刪除操作提供 Undo。
- Notes、錄音、模型、對話和其他使用者資料均儲存在 iPhone 本地。
- App 的日常使用不需要雲端服務。

## 目前卡點

目前沒有阻止 iOS 功能繼續開發的嚴重技術問題，但在正式分發和相容性驗證方面仍有兩項限制：

- **缺少正式分發帳號：**目前使用免費 Apple Account 的 Personal Team 進行 Xcode 簽名，尚未加入付費 Apple Developer Program。此方式適合個人真機開發與測試，但 provisioning profile、App ID 和裝置註冊通常只有 7 天有效期，並且受到裝置及 App 數量限制，需要定期重新簽名和安裝。因此，若要讓客戶或更多使用者長期安裝使用，需與教授或團隊確認是否能提供付費開發者帳號，並改用 TestFlight、App Store 或其他正式分發方式。
- **開發 SDK 與真機系統存在版本差：**真正需要關注的不是 macOS 與 iOS 的版本號不同，而是目前 Xcode 26.6 只包含 iOS 26.5 SDK，測試手機則運行 iOS 27.0 Beta。現階段仍可透過 Xcode 連接、建置、安裝及除錯，但 App 實際運行在比建置 SDK 更新的 Beta 系統上，可能出現正式版 iOS 或其他 iPhone 未重現的行為差異。後續應使用支援 iOS 27 SDK 的 Xcode 重新回歸，並補充其他 iPhone 型號及穩定版 iOS 的測試。
