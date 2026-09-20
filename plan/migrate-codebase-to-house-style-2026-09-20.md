<!-- date: 2026-09-20 -->
<!-- source: chat:current · user: Tham khảo kỹ và tạo plan/hook để agent migrate code có gu -->

# Plan migrate toàn bộ code về một house style

## Mục tiêu

Làm cho toàn bộ code trong repo dễ đọc, nhất quán và ít phức tạp hơn mà không đổi hành vi,
không biến `AGENTS.md`/`CLAUDE.md` thành tài liệu dài, và không tạo một mega-diff khó review.
Tiêu chí chi tiết nằm ở [CODE_STYLE.md](../CODE_STYLE.md); hai file hướng dẫn agent chỉ giữ vai trò
trỏ đường.

## Cơ sở đã kiểm chứng

Research pass độc lập được lưu tại [agent-code-taste-migration-research-2026-09-20.md](agent-code-taste-migration-research-2026-09-20.md).

Quyết định sau khi đối chiếu disk: bản research là đề xuất, không phải trạng thái đã cài.
Không có Prettier được khai báo trong `web/saved-items/package.json`; không tự thêm dependency.
`git ls-files '*.go'` hiện không có kết quả: chỉ đưa Go vào inventory nếu sau này tìm thấy source
do repo sở hữu. Không dùng cấu hình hook minh họa trong research để cài; installer hiện tại là
nguồn cấu hình thực tế. Task này giao plan và hooks; các pha migrate dưới đây dành cho agent thực thi sau đó.

- Codex đọc `AGENTS.md` theo thứ tự từ global đến repo và thư mục con, nên file này phù hợp cho
  luật ngắn, ổn định; tiêu chí dài nên được nạp theo ngữ cảnh khi cần. [OpenAI — AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- Codex có hook project/user tại `.codex/hooks.json` và hỗ trợ `PreToolUse`/`PostToolUse` cho
  `apply_patch`, `Edit`, `Write` và các tool local; hook mới hoặc thay đổi phải được review/trust.
  [OpenAI — Hooks](https://developers.openai.com/codex/hooks/)
- OpenAI mô tả “taste invariants”, mechanical linters và structural tests như cách biến review
  feedback lặp lại thành feedback loop có thể kiểm chứng.
  [OpenAI — Harness engineering](https://openai.com/index/harness-engineering/)
- Claude Code có `PreToolUse`/`PostToolUse` trong `~/.claude/settings.json`, chạy được trong
  terminal và IDE extension; `PostToolUse` không bắt được sửa file do Bash/process ngoài Claude
  nếu không match thêm Bash. [Anthropic — Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
- Gemini CLI có `BeforeTool`/`AfterTool` trong `settings.json`; các tool sửa file chính thức là
  `write_file` và `replace`, còn `run_shell_command` là đường vòng cần audit riêng.
  [Gemini CLI — Hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)
  [Gemini CLI — Tools reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md)
- ZCode có hook user-level trong `~/.zcode/cli/config.json`, với `PreToolUse`/`PostToolUse` và
  process hook; cấu hình project `.zcode/config.json` hiện bị bỏ qua nên installer dùng config
  user-level. Cần mở session mới sau khi đổi config. [ZCode — Hooks](https://zcode.z.ai/en/docs/hooks)
- Antigravity IDE/CLI có hook global trong `~/.gemini/config/hooks.json`, matcher cho
  `write_to_file`, `replace_file_content`, `multi_replace_file_content` và `run_command`, với
  payload/output riêng cho `PreToolUse` và `PostToolUse`. [Google Antigravity — Hooks](https://www.antigravity.google/docs/hooks)
- Hermes có shell hooks trong `~/.hermes/config.yaml` cho `pre_tool_call`/`post_tool_call`; các
  hook có thể chạy trên CLI, Desktop, TUI và dashboard, nhưng lần đầu có thể yêu cầu consent.
  [NousResearch Hermes — Hooks](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/hooks.md)
- Git hook chỉ chạy ở các lifecycle point của Git và `pre-commit` có thể bị bypass bằng
  `--no-verify`, nên nó là lớp cuối chứ không thay thế agent hook. [Git — githooks](https://git-scm.com/docs/githooks)
- Review nên tối ưu code health tăng dần, dùng style guide làm chuẩn thay vì sở thích cá nhân,
  và giữ change nhỏ; refactor nên là biến đổi giữ hành vi có test bảo vệ. [Google — Review standard](https://google.github.io/eng-practices/review/reviewer/standard.html)
  [Google — Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
  [Martin Fowler — Refactoring](https://www.martinfowler.com/books/refactoring.html)
- Theo ngôn ngữ: PEP 8 ưu tiên nhất quán trong project/module; Swift ưu tiên clarity tại điểm
  sử dụng; ESLint cho phép biến các lỗi cụ thể thành exit code lỗi trong CI/pre-commit.
  [PEP 8](https://peps.python.org/pep-0008/)
  [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/)
  [ESLint rule configuration](https://eslint.org/docs/latest/use/configure/rules)

## Phạm vi hiện tại

- Chrome Extension: JavaScript/CSS/HTML và artifact build trong `extension/`.
- Saved Items: TypeScript/React trong `web/saved-items/`.
- Local Bridge: Python/FastAPI trong `local-bridge/`.
- Native: Swift trong `ipad-app/`, `iphone-app/`, `macos-bridge-app/`.
- Agent surfaces hiện có: Codex, Claude, Gemini CLI, ZCode, Antigravity IDE/CLI, Hermes,
  VS Code built-in agent (kể cả model từ OmniCopilot), Cline và Roo. Xcode được cài nhưng
  thư mục `~/Library/Developer/Xcode/CodingAssistant` chưa được khởi tạo.
- Không sửa thủ công file sinh tự động, data/model/runtime hoặc fixture chỉ để “đẹp”; trước tiên
  phải xác định source of truth và lệnh sinh lại.
- Giữ nguyên mọi thay đổi dirty hiện tại; bắt đầu migration từ baseline mới, không trộn với diff
  tính năng đang dở.

### Bảng thực thi toàn bộ source

Owner mỗi hàng là agent thực thi slice đó; một reviewer độc lập duyệt trước khi chuyển hàng.
P0 phải lập danh sách bằng `git ls-files`, kể cả file root, scripts, tools, tests, cấu hình và docs.
Mỗi file có một trong bốn trạng thái: chưa xét / đã migrate / đã phù hợp / loại trừ có lý do.
Không coi số lượng test pass là bằng chứng đã xét hết file.

| Slice | Bằng chứng baseline / sau sửa | Contract cần giữ |
|---|---|---|
| `local-bridge/app`, `local-bridge/tests` | Từ `local-bridge`: `.venv/bin/python -m pytest -q tests/`; server test riêng rồi `.venv/bin/python tests/test_tokenize_import_enrich.py` | HTTP status + payload thật, database test riêng, cache/translation preservation |
| `extension/shared`, parser/helper | `node scripts/lang_family_sanity.js`, `node scripts/cue_timing_sanity.js`, `node scripts/normalize_cues_sanity.js`, `node scripts/netflix_dfxp_sanity.js` theo slice | Parse, timing, language identity, import/export |
| `extension/content`, `background`, `injected`, `sidepanel`, CSS | Các sanity check phù hợp + Chrome runtime đo pixel trước/sau và kiểm tra network thật | Isolation theo tab, JA/VI/EN, hover, resize, storage/DOM contract |
| `web/saved-items` | Từ thư mục đó: `npm run check`; test tương tác browser | Saved data, keyboard/a11y, build; build extension bằng `npm run build:extension` khi cần |
| `ipad-app`, `iphone-app` | Đọc `Scripts/COMMANDS.md`, lấy scheme/destination bằng Xcode rồi build/test với signing/test data riêng | SwiftData, parser, device lifecycle; cài đè, không xóa app |
| `macos-bridge-app`, `tools/ime-switch` | Đọc README và lệnh build hiện hữu, chạy smoke runtime theo boundary | Permissions, IME/hardware, process cleanup |
| `scripts`, root config, docs, skills | Chạy entrypoint/self-check thực sự của script bị đổi; validate cấu hình bằng parser thật | CLI args, exit codes, protocol hooks; link docs đúng nguồn |

Baseline đang lỗi phải ghi rõ reproducer và phân biệt lỗi cũ/mới. Sửa lỗi cần test Red → Green
trước refactor. CI hiện có `bridge-test-suite` và `saved-items-check`; branch protection là thao tác
riêng, chưa được cấu hình trong task này. Live caption checks không được thay bằng mocked success.

## Các pha triển khai

### P0 — Khóa tiêu chí và baseline

- Giữ `AGENTS.md`/`CLAUDE.md` ngắn; dùng [CODE_STYLE.md](../CODE_STYLE.md) làm house style chi tiết.
- Phân loại file thành source, generated, fixture, runtime data và config máy.
- Ghi baseline: `git status --short`, `git diff --check`, test hiện có, build hiện có.
- Lập bảng ngoại lệ: file generated nào được sửa qua generator nào; legacy nào chưa thể đổi.

### P1 — Bảo vệ hành vi trước refactor

- Với mỗi slice, xác định entrypoint → service/helper → storage/API/UI → output.
- Bổ sung smoke/integration check nhỏ cho các đường chưa có bằng chứng; không viết test đọc
  source bằng regex để giả pass.
- Chụp baseline UI/runtime cho extension và Saved Items nơi layout/timing là contract.

### P2 — Migrate theo vertical slice, mỗi slice một change reviewable

Thứ tự đề xuất: `local-bridge` → `extension/shared` → `extension/content/background/sidepanel` →
`web/saved-items` → iPad/iPhone/macOS. Với mỗi slice:

1. Dọn dead code và duplicate state trước.
2. Chuẩn hóa tên, boundary và error path tại nơi dùng.
3. Giảm nesting/boolean soup; không thêm abstraction nếu chưa có ít nhất hai caller rõ ràng.
4. Giữ API/storage/DOM contract; nếu buộc đổi, thêm compatibility boundary và test.
5. Chạy test thật ngay sau slice, rồi `git diff --check` và review độc lập.

### P3 — Review và đo chất lượng

- Reviewer độc lập đọc request, diff và code trên disk; đánh dấu từng tiêu chí `VERIFIED`,
  `NOT VERIFIED` hoặc `CONTRADICTED`.
- Đo trước/sau bằng các tín hiệu có thể kiểm chứng: số file/line thay đổi, duplicate state,
  lint/type errors, test failures, runtime regressions và độ lớn diff.
- Không chấm “gu” bằng điểm cảm tính; chỉ ghi finding có code anchor, lý do và bằng chứng.

### P4 — Enforce cho các thay đổi mới

- Hook dùng chung trong `scripts/code_taste_hook.py` đã hỗ trợ JSON stdin/stdout cho Codex,
  Claude Code, Gemini CLI, ZCode, Hermes và adapter payload riêng của Antigravity.
- Codex/Claude/ZCode inject checklist qua tool hooks. Gemini dùng `BeforeAgent` cho hướng dẫn
  đầu lượt và `AfterTool` cho feedback; không dựa vào `BeforeTool.additionalContext` không có trong API.
- Antigravity dùng `PreInvocation.ephemeralMessage` cho hướng dẫn và kết quả diff trước mỗi lần
  gọi model; `PostToolUse` chạy check. Không dùng hook style để trả `allow` hay override permission.
- Hermes dùng `pre_llm_call.context` để agent nhận checklist; pre/post tool hooks chạy mỗi edit/shell
  và gửi diagnostic vào stderr. Hermes bỏ qua output observer `post_tool_call`, nên không tuyên bố
  observer tự ép model đọc feedback sau từng edit.
- Mọi shell tool được match vì formatter/script/redirection đều có thể sửa file. Check không tự chạy
  command nằm trong payload; chỉ chạy Git read-only. File mới có path được kiểm tra với `git diff --no-index`.
- Đây là hướng dẫn tự-review + whitespace feedback, không phải một reviewer ngữ nghĩa tự động hay
  bảo đảm mọi code đều đẹp. Lint/typecheck/test và review độc lập vẫn nằm ở từng slice.
- Cấu hình user-level được merge bảo toàn hook hiện có bằng `scripts/install_code_taste_hooks.py`.
- VS Code có hook native trong `~/.copilot/hooks/code-taste.json`; `chat.useHooks` đang dùng
  default `true`, không cần bật chế độ tự duyệt lệnh. Hook này áp dụng cho agent tích hợp,
  không phải tất cả extension hoặc thao tác gõ tay. [Microsoft — Agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks)
- Cline có executable `~/Documents/Cline/Hooks/PreToolUse` và `PostToolUse`, trả
  `contextModification` theo schema riêng. [Cline — Hooks](https://github.com/cline/cline/blob/main/.clinerules/hooks/README.md)
- Roo 3.54.0 không có hook lifecycle native trong bundle đã kiểm tra. Installer liên kết
  `~/.roo/rules/code-taste.md` tới `CODE_STYLE.md`: đây là hướng dẫn tự nạp, không phải hook chạy
  sau edit. [Roo — Custom instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions/)
- Xcode dùng agent homes riêng; không suy ra coverage Xcode từ cấu hình CLI global. Cần khởi tạo
  agent trong Xcode, xác minh home thực tế rồi cài adapter tương ứng và chạy một edit test.
  [Apple — Extending and customizing agents](https://developer.apple.com/documentation/xcode/extending-and-customizing-agents)
- Antigravity quản lý hook trong Settings > Customizations > Hooks; Hermes có consent lần đầu
  theo cặp event/command. Sau khi cài cần mở session mới cho các client. Hook không được xem là
  security boundary hoàn chỉnh.

### Trạng thái cài đặt và giới hạn

Đã cài native hook cho tám runtime: Codex, Claude, Gemini, ZCode, Antigravity, Hermes,
VS Code và Cline. Codex đã review/trust và UI báo Pre/Post đều Active; Hermes doctor xác nhận
config/allowlist và script. Test `--installed` thực thi lệnh từ config đang dùng, không gọi model.
Nó không chứng minh một lần edit end-to-end trong mọi IDE. Mở session mới sau khi cài.

Roo mới có rules; Xcode đang ở màn hình Xcode and Apple SDKs Agreement và chưa có agent home.
Việc mở app đã xác nhận blocker, không chỉ suy luận từ thư mục bị thiếu. Cần người dùng xử lý thỏa thuận
trước khi cấu hình/test agent. Vì vậy trạng thái
nghiệm thu yêu cầu “tất cả IDE, mọi lần edit” vẫn là **NOT VERIFIED**, không thu hẹp thành “các file
JSON parse được”. Sửa tay, background process và công cụ ngoài agent không phát native tool-hook event.
Không cài daemon filesystem-watcher hoặc thay extension để giả lập việc inject context.

Hook dùng đường dẫn tuyệt đối tới repo này và Python hiện có. Nếu di chuyển repo hoặc gỡ runtime,
chạy lại installer sau khi review; không xóa repo chứa script khi các client còn tham chiếu tới nó.
Các config bị sửa có bản sao `*.before-code-taste.<UTC>.bak` cạnh file gốc; khôi phục chỉ các entry của
task này khi uninstall, giữ các hook khác. Cline dừng nếu đã có executable cùng tên để tránh ghi đè.

## Acceptance criteria

Các tiêu chí migrate sau đây là điều kiện nghiệm thu cho lần thực thi plan, không phải tuyên bố
đã migrate xong trong task cài hook:

- [ ] Mọi source slice có owner, baseline test và ngoại lệ được ghi trước khi sửa.
- [ ] Không có mega-diff; mỗi slice có diff nhỏ, reviewable và giữ hành vi.
- [ ] Mọi edit qua Codex/Claude/Gemini/ZCode/Antigravity/Hermes agent đều kích hoạt hook tương
  ứng sau khi review/trust, consent hoặc bật hook trong UI và mở session mới.
- [ ] Hook không làm mất hook hiện có, không in credential, không tự format hàng loạt.
- [ ] Hook runtime smoke pass; `git diff --check` pass; các test/build liên quan pass với output thật.
- [ ] Review độc lập không còn finding blocking; file generated/runtime không bị sửa nhầm.

## Prompt giao cho agent migrate

```text
Thực thi plan/migrate-codebase-to-house-style-2026-09-20.md và CODE_STYLE.md.
Lập inventory mọi file do repo sở hữu và baseline trước. Giữ các thay đổi đang dở của người dùng.
Migrate lần lượt toàn bộ source theo slice giữ nguyên hành vi; đánh dấu mỗi file đã migrate,
đã phù hợp hoặc loại trừ có lý do. Mỗi slice cần test runtime phù hợp, diff review và reviewer độc lập.
Không đổi API/storage/DOM contract hoặc thêm feature chỉ để làm code đẹp. Không sửa generated output
bằng tay. Chỉ báo hoàn tất khi inventory không còn source chưa xét và có bằng chứng cho mọi tiêu chí.
Nếu thiếu runtime/device/API, ghi NOT VERIFIED đúng phần thiếu, không bịa PASS.
```

## Lệnh kiểm tra tối thiểu

```bash
python3 scripts/test_code_taste_hook.py
python3 scripts/test_code_taste_hook.py --installed
python3 -m py_compile scripts/code_taste_hook.py scripts/install_code_taste_hooks.py
git diff --check
```

Sau khi cài hook user-level, kiểm tra cấu hình JSON bằng:

```bash
python3 -m json.tool /Users/hoangson/.codex/hooks.json >/dev/null
python3 -m json.tool /Users/hoangson/.claude/settings.json >/dev/null
python3 -m json.tool /Users/hoangson/.gemini/settings.json >/dev/null
python3 -m json.tool /Users/hoangson/.zcode/cli/config.json >/dev/null
python3 -m json.tool /Users/hoangson/.gemini/config/hooks.json >/dev/null
ruby -e 'require "yaml"; YAML.load_file(ARGV[0])' /Users/hoangson/.hermes/config.yaml
```

`--installed` chạy cấu hình máy thật nên chỉ dùng trên máy đã cài hook. Suite mặc định dùng Git repo
tạm để kiểm tra tracked/untracked whitespace, contract JSON, shell coverage và config idempotence.
