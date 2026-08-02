# YouTube JP Caption Studio

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-Popup-000000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/SwiftUI-iPad_App-007AFF?logo=swift&logoColor=white" alt="SwiftUI iPad App">
  <img src="https://img.shields.io/badge/Language-Reactor_Style-FF4B4B" alt="Language Reactor Style">
</p>

[English](#english) | [日本語](#日本語) | [Tiếng Việt](#tiếng-việt)

---

<a id="english"></a>
# 🇬🇧 English

**YouTube JP Caption Studio** is a Language Reactor-style tool tailored for learning Japanese via YouTube. It is available both as a **Chrome Extension** (for Desktop macOS/Windows) and a **Native iPad App**. It features Japanese timedtext interception, video overlays, a dedicated side panel for editing, furigana generation (via Sudachi on Desktop or Apple NaturalLanguage on iPad), JMdict dictionary integration (EN + VI glosses), JLPT-colored tokens, and manual EN–VI subtitle import/editing.

**No** OCR. **No** machine translation (NLLB / Opus / Gemini). All translations are purely manual or imported, ensuring maximum accuracy and personal control.

## 🌟 Key Features
1. **Smart Captions**: Intercepts Japanese timedtext directly from YouTube, displaying them as an overlay on the video and in the Side Panel (JA / EN / VI toggles; EN+VI on by default).
2. **Furigana & Dictionary**: Real-time JMdict (+ JA→VI / EN→VI). Desktop: Sudachi + local bridge `/dict`. iPad: `NLTagger` + bundled `dict.sqlite`. Tap/click a word → popup with **VI + EN** glosses and the cue’s sentence translation.
3. **JLPT / frequency coloring**: Tokens are colored by difficulty band (N5→N1 / unknown) from the shared `freq_ja.json` rank map — on both Desktop hardsub and the iPad overlay/side panel.
4. **Personal Vocabulary Tracker**: Desktop: mark Known / Learning / Ignore / Special (status colors on subtitles). iPad: save looked-up words from the dict popup into SwiftData (status-mark UI still Desktop-first).
5. **Manual Editing**: Edit JA/EN/VI and timelines in the Side Panel. Bulk Import/Export of `.txt`/`.json`. On iPad, JA shows as tappable tokens; use **Edit JA** to type.
6. **Local Data Ownership**: Manual translations and edits are prioritized and saved locally (file/SQLite via Bridge on Desktop; SwiftData on iPad). YouTube never overwrites your work.
7. **Auto IME Switching (macOS Desktop only)**: Automatically switches to the Japanese keyboard when editing Japanese subtitles.
8. **Native iPad Experience**: Standalone SwiftUI app — hardsub, side panel, tokenize, dict popup, import/export — no local server. Not full Desktop parity (no Auto IME; vocab status marks deferred).
9. **Drive sync (PC ↔ iPad)**: Shared `caption-studio-backup.json` in a fixed Google Drive folder. Extension uses `chrome.identity` + bridge `/backup/snapshot`; iPad uses Files bookmark + auto-pull on foreground. Setup: replace OAuth `client_id` in `extension/manifest.json`, Connect Drive, pick the same Drive folder on iPad (see `walkthrough.md` §3.5).

## 🏗 System Architecture
The project supports two completely different stacks to cover both Desktop and Mobile (iPad) experiences:

### 1. Desktop Architecture (Decoupled Client-Server)
Utilizes a decoupled architecture to bypass Chrome Extension limits and offload heavy NLP tasks.
* **Chrome Extension (MV3)**: Handles YouTube DOM manipulation, timedtext interception, UI rendering, and state sync.
* **Local Bridge (FastAPI `:8765`)**: The core engine written in Python. It handles NLP tokenization (Sudachi), dictionary lookups, local file I/O for subtitle storage, and macOS IME control.
* **Next.js Web App (`:3000`)**: A dedicated application for managing saved items and vocabulary, exported as a static popup for the extension.

### 2. iPad Architecture (Standalone SwiftUI)
A native iOS application providing core Desktop flows without a backend.
* **WKWebView Player**: Embeds YouTube, intercepting events and cues natively.
* **SwiftUI Native Views**: Hardsub overlay (`TokenizedJAView` + `DictPopupView`) and Side Panel (`CueEditorRow`).
* **Native Apple NLP + freq map**: `NLPTagger` for tokenization/furigana; bundled `freq_ja.json` for JLPT colors (same ceilings as Desktop `vocab_freq.py`).
* **SwiftData & SQLite**: Bundled `dict.sqlite` for `/dict`-style VI+EN lookup; SwiftData for scripts and saved vocabulary.

## 🚀 Quickstart

### Option A: Desktop (Chrome Extension + Local Bridge)

**1. Clone the repository**
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

**2. Start the Local Bridge**
```bash
cd local-bridge
./start.sh
```
The Bridge will run on `http://127.0.0.1:8765`. 

**3. Bootstrap Dictionaries (First time only)**
Large dictionaries are **not** committed to Git. You must build/download them locally.
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```
*Wait a few minutes until `models_loaded.sudachi` and dictionary flags turn `true`.*

**4. Install Chrome Extension**
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right corner).
3. Click **Load unpacked** and select the `extension/` folder in this project.
4. Open a YouTube video with Japanese captions and enjoy!

### Option B: iPad App (Native)
1. Open `ipad-app/YouTubeJPCaptionStudio.xcodeproj` in **Xcode** (regenerate with `xcodegen` if you edit `project.yml`).
2. Select your iPad device or simulator as the target.
3. Build and Run (Cmd + R). Ensure `Resources/dict.sqlite` and `Resources/freq_ja.json` are in the app bundle.
4. Paste a YouTube URL → enable **Overlay** / **Side panel** → tap a colored word for the dict popup (VI+EN + sentence).

---

<a id="日本語"></a>
# 🇯🇵 日本語

**YouTube JP Caption Studio** は、YouTubeを利用した日本語学習に特化した、Language Reactor 風のツールです。**デスクトップ用Chrome拡張機能**と**ネイティブiPadアプリ**の両方で利用可能です。日本語 timedtext の取得、オーバーレイ、サイドパネル編集、ルビ（Desktop: Sudachi / iPad: NaturalLanguage）、JMdict（EN+VI）、JLPT色分け、EN/VI 手動インポート・編集を備えています。

OCR **不使用**。機械翻訳 **不使用**。すべての翻訳は手動またはインポートによるものであり、最高の精度を保証します。

## 🌟 主な機能
1. **スマート字幕**: YouTubeから日本語 timedtext を取得し、オーバーレイとサイドパネルに表示（JA/EN/VI切替、EN+VIは既定でON）。
2. **ルビ＆辞書**: JMdict（+ JA→VI / EN→VI）。単語をタップ/クリックすると **VI + EN** と文の翻訳が出るポップアップ。
3. **JLPT / 頻度カラー**: `freq_ja.json` のランクから N5→N1 色分け（Desktop hardsub と iPad オーバーレイ/サイドパネル共通）。
4. **個人単語帳**: Desktop は Known / Learning / Ignore / Special をマーク。iPad は辞書ポップアップから単語を SwiftData に保存（状態マークUIは Desktop 先行）。
5. **手動編集**: サイドパネルで JA/EN/VI とタイムラインを編集。TXT/JSON 一括インポート/エクスポート。iPad の JA はトークン表示、「Sửa JA」で編集。
6. **ローカルデータ保存**: 手動翻訳・編集を優先してローカル保存。YouTube データで上書きされない。
7. **自動 IME 切り替え (macOS デスクトップのみ)**: 日本語編集時に日本語キーボードへ自動切替。
8. **ネイティブiPad体験**: サーバー不要の SwiftUI アプリ（hardsub・辞書・インポート等）。Auto IME や状態マークは未対応。
9. **Drive同期 (PC ↔ iPad)**: 共有 `caption-studio-backup.json`。拡張は OAuth + bridge；iPad は Files。詳細は `walkthrough.md` §3.5。

## 🏗 システム構成
本プロジェクトは、デスクトップとモバイル（iPad）の両方をカバーするため、2つの異なるアーキテクチャをサポートしています。

### 1. デスクトップアーキテクチャ (分離型クライアント・サーバー)
* **Chrome 拡張機能 (MV3)**: YouTubeのDOM操作、字幕データの取得、UIレンダリング、状態の同期。
* **ローカルブリッジ (FastAPI `:8765`)**: Pythonコアエンジン。NLPトークン化（Sudachi）、辞書検索、ファイルI/O、macOS IME制御。
* **Next.js Webアプリ (`:3000`)**: 単語帳や設定を管理するための専用アプリ（ポップアップとして機能）。

### 2. iPad アーキテクチャ (スタンドアロン SwiftUI)
* **WKWebView プレーヤー**: YouTubeを埋め込み、ネイティブでイベントと字幕を取得。
* **SwiftUI ネイティブビュー**: Hardsub（`TokenizedJAView` + `DictPopupView`）とサイドパネル。
* **Apple NLP + 頻度マップ**: `NLPTagger` で分割/ルビ、同梱 `freq_ja.json` で JLPT 色。
* **SwiftData & SQLite**: 同梱 `dict.sqlite` で VI+EN 検索、スクリプトと保存単語を永続化。

## 🚀 クイックスタート

### オプション A: デスクトップ (Chrome 拡張機能 + ローカルブリッジ)

**1. リポジトリのクローン**
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

**2. ローカルブリッジの起動**
```bash
cd local-bridge
./start.sh
```
ブリッジは `http://127.0.0.1:8765` で実行されます。

**3. 辞書のブートストラップ（初回のみ）**
大容量の辞書は Git に**含まれていません**。
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```

**4. Chrome 拡張機能のインストール**
1. Chrome を開き、`chrome://extensions` にアクセス。
2. 右上の **デベロッパーモード** を有効に。
3. **パッケージ化されていない拡張機能を読み込む** をクリックし、`extension/` フォルダを選択。
4. YouTubeビデオを開いて完了！

### オプション B: iPad アプリ (ネイティブ)
1. **Xcode** で `ipad-app/YouTubeJPCaptionStudio.xcodeproj` を開く（`project.yml` 変更時は `xcodegen`）。
2. iPad またはシミュレータを選択。
3. ビルド実行 (Cmd + R)。`Resources/dict.sqlite` と `freq_ja.json` がバンドルに含まれること。
4. YouTube URL を貼付 → Overlay / Side panel をON → 色付き単語をタップして辞書ポップアップ（VI+EN）。

---

<a id="tiếng-việt"></a>
# 🇻🇳 Tiếng Việt

**YouTube JP Caption Studio** là công cụ học tiếng Nhật qua YouTube kiểu Language Reactor. Hai nền tảng: **Chrome Extension** (Desktop) và **Native iPad App**. Hỗ trợ bắt timedtext JA, overlay, Side Panel, furigana (Sudachi / NaturalLanguage), từ điển JMdict (gloss **EN + VI**), tô màu theo JLPT, import/export EN–VI thủ công.

**Không** dùng OCR. **Không** dùng dịch máy (NLLB / Opus / Gemini). Mọi bản dịch đều do người dùng tự dịch hoặc import.

## 🌟 Tính năng chính
1. **Phụ đề thông minh**: Bắt timedtext JA từ YouTube → overlay + Side Panel (toggle JA/EN/VI; EN+VI mặc định bật).
2. **Furigana & Từ điển**: JMdict (+ JA→VI / EN→VI). Desktop: Sudachi + bridge `/dict`. iPad: `NLTagger` + `dict.sqlite`. Chạm/click từ → popup **VI + EN** và dịch câu của cue.
3. **Tô màu JLPT / tần suất**: Token màu N5→N1 / unknown từ `freq_ja.json` (chung Desktop và iPad).
4. **Từ vựng cá nhân**: Desktop đánh dấu Đã biết / Đang học / Bỏ qua / Đặc biệt. iPad: Lưu từ từ popup vào SwiftData (UI đánh dấu trạng thái vẫn ưu tiên Desktop).
5. **Sửa phụ đề**: Side Panel sửa JA/EN/VI + timeline; Import/Export `.txt`/`.json`. iPad: JA dạng token chạm được; **Sửa JA** để gõ.
6. **Lưu trữ Local (Data Ownership)**: Bản dịch/sửa ưu tiên lưu local; YouTube không đè lên.
7. **Auto IME (chỉ macOS Desktop)**: Tự chuyển bàn phím Nhật khi sửa JA.
8. **App iPad Native**: SwiftUI độc lập — hardsub, dict popup, import/export — không cần server. Chưa đủ parity tuyệt đối (không Auto IME; chưa mark Known/Learning trên popup).
9. **Đồng bộ Drive (PC ↔ iPad)**: Cùng file `caption-studio-backup.json` trong folder Drive cố định. Extension: OAuth + bridge `/backup/snapshot`; iPad: Files + auto-pull khi foreground. Setup: thay `client_id` trong `manifest.json`, Connect Drive, chọn cùng folder trên iPad (xem `walkthrough.md` §3.5).

## 🏗 Kiến trúc Hệ thống
Dự án được xây dựng với hai kiến trúc hoàn toàn khác nhau để tối ưu cho cả Desktop và Mobile:

### 1. Kiến trúc Desktop (Phân tách Client-Server)
* **Chrome Extension (MV3)**: Quản lý DOM của YouTube, chặn bắt phụ đề, render UI và đồng bộ trạng thái.
* **Local Bridge (FastAPI `:8765`)**: Backend cục bộ viết bằng Python. Tokenize (Sudachi), tra cứu từ điển SQLite, lưu trữ file I/O và điều khiển bộ gõ (IME) trên macOS.
* **Next.js Web App (`:3000`)**: Ứng dụng quản lý từ vựng và thiết lập, đóng gói thành Popup UI.

### 2. Kiến trúc iPad (Ứng dụng Độc lập SwiftUI)
* **WKWebView Player**: Nhúng YouTube, bắt sự kiện và phụ đề qua JS bridge.
* **SwiftUI Native Views**: Hardsub (`TokenizedJAView` + `DictPopupView`) và Side Panel (`CueEditorRow`).
* **Apple NLP + freq map**: `NLPTagger` tokenize/furigana; `freq_ja.json` tô JLPT (cùng ceiling Desktop `vocab_freq.py`).
* **SwiftData & SQLite**: Bundle `dict.sqlite` tra VI+EN; SwiftData lưu script và từ đã lưu.

## 🚀 Hướng dẫn Cài đặt

### Lựa chọn A: Desktop (Chrome Extension + Local Bridge)

**1. Clone Source Code**
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

**2. Khởi chạy Local Bridge**
```bash
cd local-bridge
./start.sh
```
Server Local Bridge sẽ chạy tại `http://127.0.0.1:8765`.

**3. Tải và Build Từ điển (Chỉ chạy lần đầu)**
Vì database từ điển rất nặng nên **không** được commit lên Git.
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```

**4. Cài đặt Chrome Extension**
1. Mở Chrome, truy cập `chrome://extensions`.
2. Bật **Developer mode**.
3. Bấm **Load unpacked** và chọn thư mục `extension/`.
4. Mở một video YouTube và trải nghiệm!

### Lựa chọn B: Ứng dụng iPad (Native)
1. Mở `ipad-app/YouTubeJPCaptionStudio.xcodeproj` bằng **Xcode** (đổi `project.yml` thì chạy `xcodegen`).
2. Chọn iPad hoặc Simulator.
3. Build and Run (Cmd + R). Bundle phải có `Resources/dict.sqlite` và `freq_ja.json`.
4. Dán URL YouTube → bật **Overlay** / **Side panel** → chạm từ màu để mở popup từ điển (VI+EN + dịch câu).
