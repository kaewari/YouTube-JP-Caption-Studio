# YouTube Caption (ルビ + EN/VI インポート)

YouTube字幕用のLanguage Reactor風Chrome拡張機能: timedtext JAの読み込み、オーバーレイ + サイドパネル、ルビ (Sudachi)、JMdict辞書、英語/ベトナム語の手動インポート・編集機能を備えています。

OCRは**不使用**。機械翻訳 (NLLB / Opus / Gemini) も**不使用**。

拡張機能 MV3 `0.9.7` · Bridge FastAPI (`127.0.0.1:8765`) · 保存済みアイテム Next.js (dev `:3000` または静的ポップアップ)。

## アーキテクチャ

```
YouTube watch page
  ├─ injected/page_capture.js   (MAIN world: media_time, timedtext傍受)
  ├─ content/content.js         (オーバーレイ, キャッシュマージ, SP_CMD)
  └─ sidepanel/                 (字幕リスト, JA/EN/VI編集, インポート/エクスポート)
        │
        ▼
background/service_worker.js    (YT_LOAD_CAPTIONS, BRIDGE_FETCH, IME, storage→bridge)
        │
        ▼
local-bridge :8765              (tokenize, dict, scripts/, ime, extension_state)
        │
        ▼
scripts/{videoId}/              (cues.json + script.txt + meta.json)
web/saved-items/                (ポップアップ UI: vocab + settings)
```

## 詳細なフォルダおよびファイル構造

### 1. `extension/` (Chrome Extension MV3)
拡張機能のソースコードを含むディレクトリ (Chromeにパッケージ化されていない拡張機能として読み込みます)。
- **`manifest.json`**: 拡張機能の権限、バックグラウンドワーカー、コンテンツスクリプトの設定。
- **`background/service_worker.js`**: バックグラウンドスクリプト (YouTubeからの字幕リクエストを傍受し、`local-bridge` APIを呼び出し、IMEとストレージ同期を管理)。
- **`content/content.js`**: YouTubeの画面に直接挿入されるスクリプト。字幕オーバーレイの管理とキャッシュの同期を行います。
- **`content/cue_timing.js`**: タイマーを管理し、ビデオのタイムラインに合わせて字幕の表示を同期します。
- **`content/normalize_cues.js`**: YouTubeからの生字幕データをクリーニング・標準化します (効果音の削除、フォーマットの統一)。
- **`injected/page_capture.js`**: MAIN worldで実行されるスクリプト。内部のYouTubeプレーヤー変数にアクセスし、XML/JSON3リクエストを傍受します。
- **`sidepanel/`**: 字幕リストの表示、編集 (JA/EN/VI)、タイムラインのためのサイドパネルUIのソースコード。
- **`popup/`**: 拡張機能アイコンをクリックした際に表示されるUIとして使用される、Next.js (`web/saved-items`) からビルドされた静的コード。
- **`shared/`**: 共通のユーティリティファイル (`import_parse.js`、`romaji_kana.js`、`vocab_style.js`など)。

### 2. `local-bridge/` (FastAPI バックエンド)
ローカルで実行されるバックエンド (`127.0.0.1:8765`)。拡張機能では処理できない重いNLP処理やシステム操作を行います。
- **`main.py`**: FastAPIサーバーのエントリポイント。APIルート (tokenize, dict, scripts, ime, extension_state) を定義します。
- **`tokenize_ja.py`**: SudachiPyライブラリをラップし、日本語の文法分析、形態素解析、および読み (ルビ) の抽出を行います。
- **`dictionary.py`**: SQLiteと連携してJMdict (日英/日越) の検索を行います。
- **`vocab_freq.py`**: 語彙の難易度を分類します (出現頻度に基づいたJLPTレベルの判定)。
- **`script_store.py`**: 各動画の字幕スクリプトデータをディスク (`scripts/` フォルダ内) に読み書きします。
- **`ime_switch.py`**: ユーザーがサイドパネルで入力する際、macOSのIME切り替えを制御します。
- **`governor.py`**: リソースマネージャー。PCのRAM/CPU構成に基づいて同時処理数を制限します。
- **`models.py`**: APIリクエスト/レスポンス用のデータ構造 (Pydanticスキーマ) を定義します。
- **`bootstrap.py`**: 初回起動時に辞書データベースをダウンロード、インストール、インデックス化するバックグラウンドスクリプト。
- **`cache.py`**: 辞書検索を高速化するためのLRUキャッシュを実装します。
- **`text_utils.py`**: 小さなユーティリティ関数 (カタカナからひらがなへの変換など)。
- **`start.sh`**: 仮想環境の作成、pipパッケージのインストール、およびuvicornの起動を自動化するスクリプト。
- **`Dockerfile` / `docker-compose.yml`**: Dockerを使用してBridgeを隔離された環境で実行するためのサポート。

### 3. `web/saved-items/` (React/Next.js UI)
拡張機能のポップアップUIと設定を設計するためのNext.jsプロジェクト。
- **`src/app/`**, **`src/components/`**, **`src/lib/`**: UIのソースコード。保存された語彙リストの管理と `chrome.storage.local` との通信を行います。
- `npm run build:extension` を実行すると、Next.jsのコードが完全に静的ビルドされ、`extension/popup/` にエクスポートされます。

### 4. `scripts/` (出力データとサブツール)
- **`{video_id}/`**: 編集された各動画はここにある個別のディレクトリとして保存されます。含まれるファイル: `cues.json` (詳細データ)、`script.txt` (人間が読めるテキスト形式)、および `meta.json`。
- **`ime-switch/`**: macOS IME切り替えプログラムをビルドするためのSwiftソースコード (`ime_select.swift`)。

### 5. ルートディレクトリ
- **`docker-compose.yml`**: Dockerを使用してエコシステム全体 (bridge + web) を起動します。
- **`.gitignore`**: 一時ファイル、ログ、仮想環境ディレクトリをgit管理から除外します。
- **`AGENTS.md` / `CLAUDE.md`**: AIコーディングアシスタント (Cursor, Claude, Gemini) 用のルールや動作ガイドライン。

## クイックスタート

### 0. クローン (新しいマシン)

```bash
git clone https://github.com/kaewari/Translate-realtime-OCR-youtube-video.git
cd Translate-realtime-OCR-youtube-video
```

大きな辞書 (`data/dict/dict.sqlite`、`jmdict_mini.json`、`JMdict_e.*` など) は git に**含まれません**。bootstrap がローカルでダウンロード/ビルドします。小さなシード (`en_vi.json`、`ja_vi.json`、`freq_ja.json`、`vnedict.txt`) はコミット済みです。

### 1. Bridge

```bash
cd local-bridge
./start.sh
```

| サービス | URL |
| --- | --- |
| Bridge | `http://127.0.0.1:8765` |
| Saved Items (Next) | `http://127.0.0.1:3000` |

UIをスキップ: `SKIP_SAVED_ITEMS=1 ./start.sh`.

初回 / 新しいマシン — 辞書の bootstrap（ネットワーク必須、数分）:

```bash
curl -X POST http://127.0.0.1:8765/bootstrap
curl -s http://127.0.0.1:8765/health
# models_loaded.sudachi / dict / freq → 完了時 true
```

任意: 再ダウンロードの代わりに別マシンから `data/dict/` をコピー。

辞書ポップアップ: JMdictからEN、`jmdict_vi` (Yomitan dreamofi) + シード `ja_vi.json` からVI — 機械翻訳なしで並べて表示。

### 2. 拡張機能

1. `chrome://extensions` → デベロッパーモード
2. **パッケージ化されていない拡張機能を読み込む** → `extension/` ディレクトリを選択
3. 日本語字幕のあるYouTube動画を開く
4. ツールバーアイコン → 保存済みアイテム / 設定ポップアップ
5. サイドパネル: プレーヤー上のピル、`autoOpen`、または拡張機能からパネルを開く

Saved Items UIを変更した後:

```bash
cd web/saved-items && npm run build:extension
# → extension/popup/  その後、拡張機能をリロードします
```

### 3. リグレッション

```bash
cd local-bridge && source .venv/bin/activate
python -m tests.test_tokenize_import_enrich   # Bridgeが実行中である必要があります
```

## 字幕フロー

1. **読み込み** (YSDスタイルのカスケード):
   - ページ傍受 `/api/timedtext` (プレーヤーでCCをオンにする)
   - Service worker: `baseUrl` → `ytInitialPlayerResponse`をスクレイピング → ANDROID Innertube
   - **まず生**のURLをフェッチし、XML `<text>`/`<p>` または json3 をパース
2. **正規化** (`normalize_cues.js`): SFXを除去。YouTubeの開始/終了時間は**保持**
3. **マージ** `chrome.storage.local` (`transcript:${videoId}`) + ディスク `data/subtitles/{videoId}/`
4. **オーバーレイ** ページスクリプトからの `media_time` に基づいてアクティブな字幕をオーバーレイ
5. 英語/ベトナム語は**インポート**または**手動編集**のみ — 自動機械翻訳は行いません

**オーナーシップ:** 編集されたJA/タイムラインはYouTubeの再マージに優先します。削除された字幕は `video_id` ごとに**トゥームストーン化**されます (リロードしても復活しません)。編集済みの充実したスクリプトがYouTubeの貧弱なマージによって上書きされることはありません。

## サイドパネル — スクリプト編集

**Enterキーでのみ**コミットされます (Blur / Escapeでドラフトはキャンセルされます):

| フィールド | Enter | Blur / Escape |
| --- | --- | --- |
| **JA** | コミット + 再トークン化 (`/tokenize_batch`); **EN/VIは保持** | 破棄 |
| **EN** | コミット + ロック `user` | 破棄 |
| **VI** | コミット + ロック `user` | 破棄 |
| **タイムライン** | 時間のコミット | Blurでもコミット |

- JAにフォーカス → `<textarea lang="ja-JP">` + IME (`POST /ime/switch`) / ローマ字→かなフォールバック
- インポートのマージ/置換 → EN/VI ロック `import` → トークンのエンリッチ
- **翻訳のクリア**: EN/VI/トークンをクリア (JAは保持)
- **保存済み字幕のクリア**: キャッシュ + ディスクを消去し、YouTubeから再読み込みします

## 保存済みアイテム (ポップアップ)

- ソース: `web/saved-items/` → 静的 `extension/popup/popup.html`
- Source of truth: `chrome.storage.local` (`userVocab`, `hardsubSettings`)
- localhost:3000 は `GET /extension_state` をポーリングします (~1.5秒)。SWはstorageをbridgeにプッシュします
- タブ: **保存済み単語** (アクティブ); 語彙 / 保存済みセンテンス = プレースホルダー
- **設定** は content/side panel と同じ `hardsubSettings` に書き込みます

UIの詳細: [`web/saved-items/README.md`](web/saved-items/README.md).

## API Bridge (`127.0.0.1:8765`)

| エンドポイント | 説明 |
| --- | --- |
| `GET /health` | ready, `models_loaded` (sudachi/dict/freq; mt/ocr は常に false), caps |
| `POST /bootstrap` | JMdict + Sudachi + freq |
| `POST /tokenize` | `{ text }` → トークン (reading, freq_rank, pos, jlpt) |
| `POST /tokenize_batch` | `{ cues: [{id, text}] }` |
| `POST /dict` | `{ surface, lemma? }` — JMdictからのEN; `jmdict_vi.json` (+ シード `ja_vi.json`) からのVI |
| `POST /scripts/save` | 永続化 → `data/subtitles/{videoId}/` |
| `GET/DELETE /scripts/{video_id}` | 読み込み / 消去 |
| `POST /ime/switch` | `{ to: "ja"\|"abc"\|"restore" }` (+ `/ime/ja`, `/ime/abc`, `/ime/status`) |
| `GET/POST /extension_state` | `userVocab` + `hardsubSettings` をミラーリング |
| `GET /vocab/bands` | 語彙バンド + プレビュートークン |

## データの永続化

| 場所 | コンテンツ |
| --- | --- |
| `chrome.storage.local` | `transcript:${id}`, `transcriptMeta:${id}`, settings, vocab |
| `data/subtitles/{videoId}/cues.json` | 全ての字幕 (JA/EN/VI/tokens/locks) |
| `data/subtitles/{videoId}/script.txt` | 読みやすい形式のエクスポート |
| `data/subtitles/{videoId}/meta.json` | カウント + タイトル/URL |
| `data/config/extension_state.json` | localhost用の設定ミラー |
| `data/dict/dict.sqlite` | ランタイム辞書 (bootstrap がビルド; コミットしない) |
| `data/dict/jmdict_vi.json` | JA→VIインデックス (bootstrap が zip をダウンロード; コミットしない) |

キャッシュマッチ: `start_media_time` ±0.35秒 + source。保存のデバウンスは約400ミリ秒。

## メインパス

| パス | 役割 |
| --- | --- |
| `extension/content/content.js` | エンジンオーバーレイ + SP_CMD + マージ |
| `extension/sidepanel/` | UI字幕リスト |
| `extension/background/service_worker.js` | 字幕フェッチ、ブリッジプロキシ、IME |
| `extension/shared/vocab_style.js` | JLPT / 語彙CSSクラス |
| `local-bridge/app/main.py` | FastAPIルート |
| `local-bridge/app/services/tokenize_ja.py` | Sudachi |
| `local-bridge/app/services/dictionary.py` | JMdict (SQLite) |
| `local-bridge/app/services/script_store.py` | ディスク上のスクリプト → `data/subtitles/` |
| `local-bridge/app/scripts/bootstrap.py` | 辞書のダウンロード/インデックス + sqlite ビルド |
| `tools/ime-switch/` | Swift IME ヘルパー (macOS) |
| `.cursor/skills/youtube-hardsub-ocr` | アーキテクチャスキル |
| `.cursor/skills/local-bridge-dev` | Bridgeの開始/デバッグ |
| `.cursor/skills/hardsub-ocr-regression` | トークン化/インポートのリグレッション |

## 制限事項

- Chromeの **browser_action ポップアップ** は、CSSで `width: 100%` に設定していても、最大約 800×600 に制限される場合があります。
- macOS IMEはbridge + `bin/ime-select`を必要とします。オフライン時 → `lang=ja-JP` + ローマ字フォールバックのみ。
- ワークスペースリポジトリには通常、ルートに `.git` が**ありません**。IDEの誤ったコンフリクト警告を防ぐため、`script.txt` は `# ---…` を使用します (以前のような `=` のみの行は使用しません)。
- 「再翻訳」キュー / 自動機械翻訳 はありません。

## macOS IME

Bridge実行中 → サイドパネルは `POST /ime/switch` を介して入力ソースを切り替えます。
`start.sh` は `tools/ime-switch/ime_select.swift` → `local-bridge/bin/ime-select` をビルドします。
