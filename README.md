# YouTube JP Caption Studio

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-Popup-000000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Language-Reactor_Style-FF4B4B" alt="Language Reactor Style">
</p>

[English](#english) | [日本語](#日本語) | [Tiếng Việt](#tiếng-việt)

---

<a id="english"></a>
# 🇬🇧 English

**YouTube JP Caption Studio** is a Language Reactor-style Chrome extension tailored for learning Japanese via YouTube. It features Japanese timedtext interception, video overlays, a dedicated side panel for editing, Sudachi-powered furigana, JMdict dictionary integration, and manual EN–VI subtitle import/editing.

**No** OCR. **No** machine translation (NLLB / Opus / Gemini). All translations are purely manual or imported, ensuring maximum accuracy and personal control.

## 🌟 Key Features
1. **Smart Captions**: Intercepts Japanese timedtext directly from YouTube, displaying them as an overlay on the video and in the Side Panel.
2. **Furigana & Dictionary**: Real-time integration with Sudachi and JMdict (EN/VI). Click on any word to look up its meaning.
3. **Personal Vocabulary Tracker**: Mark words by your knowledge level (Known / Learning / Ignore). Vocabulary states are highlighted dynamically in the video subtitles.
4. **Manual Editing**: Edit JA/EN/VI subtitles and adjust timelines directly from the Side Panel.
5. **Local Data Ownership**: Manual translations and edits are prioritized and saved locally to your disk. YouTube will never overwrite your hard work.
6. **Auto IME Switching (macOS)**: Automatically switches to the Japanese keyboard when editing Japanese subtitles.

## 🏗 System Architecture
The project utilizes a decoupled Client-Server architecture to bypass the limitations of Chrome Extensions (MV3) and offload heavy NLP tasks.

* **Chrome Extension (MV3)**: Handles YouTube DOM manipulation, timedtext interception, UI rendering, and state sync.
* **Local Bridge (FastAPI `:8765`)**: The core engine written in Python. It handles NLP tokenization (Sudachi), dictionary lookups, local file I/O for subtitle storage, and macOS IME control.
* **Next.js Web App (`:3000`)**: A dedicated application for managing saved items and vocabulary, exported as a static popup for the extension.

## 🚀 Quickstart

### 1. Clone the repository
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

### 2. Start the Local Bridge
```bash
cd local-bridge
./start.sh
```
The Bridge will run on `http://127.0.0.1:8765`. 

### 3. Bootstrap Dictionaries (First time only)
Large dictionaries are **not** committed to Git. You must build/download them locally.
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```
*Wait a few minutes until `models_loaded.sudachi` and dictionary flags turn `true`.*

### 4. Install Chrome Extension
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right corner).
3. Click **Load unpacked** and select the `extension/` folder in this project.
4. Open a YouTube video with Japanese captions and enjoy!

*(To rebuild the popup UI: `cd web/saved-items && npm run build:extension` and reload the extension in Chrome).*

---

<a id="日本語"></a>
# 🇯🇵 日本語

**YouTube JP Caption Studio** は、YouTubeを利用した日本語学習に特化した、Language Reactor 風の Chrome 拡張機能です。日本語の timedtext の取得、ビデオオーバーレイ、編集用サイドパネル、Sudachiによるルビ（ふりがな）付与、JMdict 辞書統合、そして英語・ベトナム語の手動インポート・編集機能を備えています。

OCR **不使用**。機械翻訳 **不使用**。すべての翻訳は手動またはインポートによるものであり、最高の精度を保証します。

## 🌟 主な機能
1. **スマート字幕**: YouTubeから日本語の timedtext を直接取得し、ビデオ上にオーバーレイおよびサイドパネルとして表示します。
2. **ルビ＆辞書**: SudachiとJMdict（英語/ベトナム語）をリアルタイムで統合。単語をクリックするだけで意味を検索できます。
3. **個人単語帳**: 習熟度（知っている / 学習中 / 無視）に応じて単語をマーク。ビデオ字幕内で単語の状態がハイライトされます。
4. **手動編集**: サイドパネルから直接、JA/EN/VIの字幕テキストとタイムラインを編集可能。
5. **ローカルデータ保存**: 手動での翻訳や編集データは優先され、PCのディスクにローカル保存されます。YouTubeのデータで上書きされることはありません。
6. **自動 IME 切り替え (macOS)**: 日本語字幕の編集時に自動的に日本語キーボードに切り替わります。

## 🏗 システム構成
本プロジェクトは、Chrome拡張機能 (MV3) の制限を回避し、重いNLPタスクを処理するために、分離されたクライアントサーバーアーキテクチャを採用しています。

* **Chrome 拡張機能 (MV3)**: YouTubeのDOM操作、字幕データの取得、UIレンダリング、状態の同期を処理します。
* **ローカルブリッジ (FastAPI `:8765`)**: Pythonで書かれたコアエンジン。NLPトークン化（Sudachi）、辞書検索、字幕保存のためのローカルファイルI/O、macOS IME制御を処理します。
* **Next.js Webアプリ (`:3000`)**: 単語帳や設定を管理するための専用アプリ。静的ファイルとしてエクスポートされ、拡張機能のポップアップとして機能します。

## 🚀 クイックスタート

### 1. リポジトリのクローン
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

### 2. ローカルブリッジの起動
```bash
cd local-bridge
./start.sh
```
ブリッジは `http://127.0.0.1:8765` で実行されます。

### 3. 辞書のブートストラップ（初回のみ）
大容量の辞書は Git に**含まれていません**。ローカルで構築/ダウンロードする必要があります。
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```
*`models_loaded.sudachi` と辞書のフラグが `true` になるまで数分待ちます。*

### 4. Chrome 拡張機能のインストール
1. Chrome を開き、`chrome://extensions` にアクセスします。
2. 右上の **デベロッパーモード** を有効にします。
3. **パッケージ化されていない拡張機能を読み込む** をクリックし、このプロジェクトの `extension/` フォルダを選択します。
4. 日本語字幕のあるYouTubeビデオを開いてお楽しみください！

*(ポップアップ UI を再ビルドする場合: `cd web/saved-items && npm run build:extension` を実行後、Chrome で拡張機能をリロードします)。*

---

<a id="tiếng-việt"></a>
# 🇻🇳 Tiếng Việt

**YouTube JP Caption Studio** là một Chrome Extension kiểu Language Reactor chuyên dụng cho việc học tiếng Nhật qua YouTube. Hệ thống hỗ trợ lấy phụ đề (timedtext) tiếng Nhật, hiển thị overlay trên video, tích hợp Side Panel để chỉnh sửa, tra từ điển JMdict, gán furigana (bằng Sudachi), và hỗ trợ import/sửa bản dịch tiếng Anh/Việt thủ công.

**Không** dùng OCR. **Không** dùng dịch máy (NLLB / Opus / Gemini). Mọi bản dịch đều do người dùng tự dịch hoặc import, đảm bảo chất lượng và quyền kiểm soát tuyệt đối.

## 🌟 Tính năng chính
1. **Phụ đề thông minh**: Bắt chính xác luồng timedtext tiếng Nhật từ YouTube, hiển thị trực tiếp lên video (overlay) và đồng bộ với Side Panel.
2. **Furigana & Từ điển**: Tích hợp Sudachi + JMdict (EN/VI). Click vào bất kỳ từ nào trên phụ đề để tra nghĩa ngay lập tức.
3. **Từ vựng cá nhân**: Đánh dấu từ vựng theo trình độ (Đã biết / Đang học / Bỏ qua). Hệ thống tự động tô màu từ vựng đó trên các video YouTube.
4. **Sửa phụ đề trực tiếp**: Cho phép chỉnh sửa JA/EN/VI và thay đổi timeline (thời gian hiển thị) của từng câu sub ngay trong Side Panel.
5. **Lưu trữ Local (Data Ownership)**: Các chỉnh sửa và bản dịch của bạn luôn được ưu tiên và lưu vĩnh viễn xuống ổ cứng máy tính. Không lo bị phụ đề YouTube đè lên.
6. **Auto IME (macOS)**: Tự động chuyển đổi bộ gõ sang tiếng Nhật khi người dùng bấm vào ô sửa phụ đề tiếng Nhật.

## 🏗 Kiến trúc Hệ thống
Dự án sử dụng kiến trúc Phân tách (Decoupled Client-Server) để vượt qua các giới hạn của Chrome Extension (MV3) và tối ưu hóa xử lý ngôn ngữ tự nhiên (NLP).

* **Chrome Extension (MV3)**: Quản lý DOM của YouTube, chặn bắt phụ đề, render UI và đồng bộ trạng thái.
* **Local Bridge (FastAPI `:8765`)**: Backend cục bộ viết bằng Python. Gánh vác tác vụ nặng như Tokenize (Sudachi), tra cứu từ điển SQLite (JMdict), lưu trữ file I/O xuống ổ cứng và điều khiển bộ gõ (IME) trên macOS.
* **Next.js Web App (`:3000`)**: Ứng dụng quản lý từ vựng và thiết lập, được xuất thành file tĩnh (static HTML) để làm Popup UI cho Extension.

## 🚀 Hướng dẫn Cài đặt

### 1. Clone Source Code
```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

### 2. Khởi chạy Local Bridge
```bash
cd local-bridge
./start.sh
```
Server Local Bridge sẽ chạy tại `http://127.0.0.1:8765`.

### 3. Tải và Build Từ điển (Chỉ chạy lần đầu)
Vì database từ điển rất nặng nên **không** được commit lên Git. Bạn cần chạy lệnh sau để tải về:
```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
```
*Đợi vài phút. Khi kiểm tra thấy `models_loaded.sudachi` và các cờ từ điển chuyển thành `true` là thành công.*

### 4. Cài đặt Chrome Extension
1. Mở Chrome, truy cập `chrome://extensions`.
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục `extension/` của dự án này.
4. Mở một video YouTube có phụ đề tiếng Nhật và trải nghiệm!

*(Nếu bạn sửa UI của Saved Items, hãy chạy `cd web/saved-items && npm run build:extension` rồi Reload lại extension trong Chrome).*
