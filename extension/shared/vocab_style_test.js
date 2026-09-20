const assert = require("assert");
require("./vocab_style.js");

const Vocab = globalThis.HardsubVocab;

// Test 1: Module export presence
assert.ok(Vocab, "HardsubVocab should be defined on globalThis");
assert.strictEqual(typeof Vocab.segmentFallback, "function", "HardsubVocab.segmentFallback should be a function");

// Test 2: Fallback segmentation with Intl.Segmenter
const text = "日本語を勉強します。";
const tokens = Vocab.segmentFallback(text);

assert.ok(Array.isArray(tokens), "tokens should be an array");
assert.ok(tokens.length > 0, "should produce tokens for Japanese text");

// Check token structure: surface, reading, lemma, pos, jlpt
const surfaces = tokens.map((t) => t.surface).join("");
assert.strictEqual(surfaces, text, "concatenated surfaces should match original text");

const firstTok = tokens[0];
assert.ok(firstTok.surface, "token must have surface");
assert.strictEqual(typeof firstTok.reading, "string", "token reading should be string");
assert.strictEqual(typeof firstTok.pos, "string", "token pos should be string");

// Test 3: Empty or invalid input
assert.deepStrictEqual(Vocab.segmentFallback(""), [], "empty string returns empty array");
assert.deepStrictEqual(Vocab.segmentFallback(null), [], "null returns empty array");

// Test 4: Default level colors and unknown color
assert.strictEqual(Vocab.DEFAULT_LEVEL_COLORS.unknown.color, "#94a3b8", "Unknown JLPT color should be distinct #94a3b8");

// Test 5: COMMON_JLPT_WORDS fallback
assert.strictEqual(Vocab.jlptLevel({ surface: "私", lemma: "私" }), "n5", "私 should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "皆さん", lemma: "皆さん" }), "n5", "皆さん should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "世界", lemma: "世界" }), "n4", "世界 should map to n4");
assert.strictEqual(Vocab.jlptLevel({ surface: "経験", lemma: "経験" }), "n3", "経験 should map to n3");

// Test 6: Bilingual JLPT keyword rendering
const sampleTokens = [
  { surface: "皆さん", lemma: "皆さん", pos: "名詞" },
  { surface: "こんにちは", lemma: "こんにちは", pos: "感動詞" }
];
const viHtml = Vocab.renderBilingualHtml("Chào mọi người", "vi", sampleTokens, { enableBilingualJlptColor: true });
assert.ok(viHtml.includes('class="tok-trans jlpt-n5"'), "Vietnamese translation should highlight mọi người with jlpt-n5");
assert.ok(viHtml.includes('data-lemma="皆さん"'), "Vietnamese translation should include data-lemma");
assert.ok(viHtml.includes('>mọi người</span>'), "Vietnamese translation should wrap text");

const enHtml = Vocab.renderBilingualHtml("Hello everyone", "en", sampleTokens, { enableBilingualJlptColor: true });
assert.ok(enHtml.includes('class="tok-trans jlpt-n5"'), "English translation should highlight everyone with jlpt-n5");
assert.ok(enHtml.includes('data-lemma="皆さん"'), "English translation should include data-lemma");
assert.ok(enHtml.includes('>everyone</span>'), "English translation should wrap text");

// Test 7: Bilingual JLPT disabled setting
const plainVi = Vocab.renderBilingualHtml("Chào mọi người", "vi", sampleTokens, { enableBilingualJlptColor: false });
assert.strictEqual(plainVi, "Chào mọi người", "Should remain plain text when bilingual JLPT is disabled");

// Test 8: English single-letter "I" and kana token lookup
const watashiTokens = [{ surface: "わたし", lemma: "わたし", pos: "代名詞" }];
const enWatashi = Vocab.renderBilingualHtml("I understand", "en", watashiTokens, { enableBilingualJlptColor: true });
assert.ok(enWatashi.includes('class="tok-trans jlpt-n5"'), "English single letter I should be highlighted");
assert.ok(enWatashi.includes('>I</span>'), "English I should be wrapped");

// Test 9: Vietnamese accented words matching Unicode boundaries
const viAccented = Vocab.renderBilingualHtml("Chào bạn bè và tôi", "vi", [
  { surface: "友達", lemma: "友達", pos: "名詞" },
  { surface: "私", lemma: "私", pos: "代名詞" }
], { enableBilingualJlptColor: true });
assert.ok(viAccented.includes('class="tok-trans jlpt-n5"') && viAccented.includes('>bạn bè</span>'), "Vietnamese friend with accent should be highlighted");
assert.ok(viAccented.includes('class="tok-trans jlpt-n5"') && viAccented.includes('>tôi</span>'), "Vietnamese tôi with accent should be highlighted");

// Test 10: renderRubyHtml output with furigana toggle
const testCue = {
  tokens: [
    { surface: "日本語", reading: "にほんご", lemma: "日本語", pos: "名詞" },
    { surface: "勉強", reading: "べんきょう", lemma: "勉強", pos: "名詞" },
  ],
};
const rubyWithFurigana = Vocab.renderRubyHtml(testCue, { showFurigana: true });
assert.ok(rubyWithFurigana.includes("<rt>にほんご</rt>"), "Should include furigana <rt>");

const rubyWithoutFurigana = Vocab.renderRubyHtml(testCue, { showFurigana: false });
assert.ok(!rubyWithoutFurigana.includes("<rt>"), "Should not include <rt> when furigana disabled");

const emptyCueRuby = Vocab.renderRubyHtml({ source: "テスト" }, { showFurigana: true });
assert.ok(emptyCueRuby.includes("テスト"), "Should fallback to plain source text");

// Test 11: Direct dictionary bilingual coloring even with empty tokens array []
const viDirectOnly = Vocab.renderBilingualHtml("Chào bạn bè và gia đình", "vi", [], { enableBilingualJlptColor: true });
assert.ok(viDirectOnly.includes('class="tok-trans jlpt-n5"') && viDirectOnly.includes('>bạn bè</span>'), "Direct VI should highlight bạn bè even with empty tokens");
assert.ok(viDirectOnly.includes('class="tok-trans jlpt-n5"') && viDirectOnly.includes('>gia đình</span>'), "Direct VI should highlight gia đình even with empty tokens");

const enDirectOnly = Vocab.renderBilingualHtml("Hello my friend and family", "en", null, { enableBilingualJlptColor: true });
assert.ok(enDirectOnly.includes('class="tok-trans jlpt-n5"') && enDirectOnly.includes('>friend</span>'), "Direct EN should highlight friend even with null tokens");
assert.ok(enDirectOnly.includes('class="tok-trans jlpt-n5"') && enDirectOnly.includes('>family</span>'), "Direct EN should highlight family even with null tokens");

// Test 12: User's exact sentence from real video
const userVi = "Lúc đó, tôi cảm thấy vô cùng thất vọng, tự hỏi tại sao mình lại không nhận được bất kỳ cơ hội nào chỉ vì mình còn trẻ. Tôi muốn thử những việc như thế này, và tôi cũng muốn đưa ra những thông báo như thế này.";
const userEn = "that time, I felt incredibly frustrated, wondering why I didn't get any opportunities just because I was young. I'd like to try things like this, and I'd also like to make announcements like this.";

const userViHtml = Vocab.renderBilingualHtml(userVi, "vi", [], { enableBilingualJlptColor: true });
assert.ok(userViHtml.includes("tok-trans jlpt-n5") && userViHtml.includes(">Lúc đó</span>"), "user VI must color Lúc đó");
assert.ok(userViHtml.includes("tok-trans jlpt-n5") && userViHtml.includes(">tôi</span>"), "user VI must color tôi");
assert.ok(userViHtml.includes("tok-trans jlpt-n3") && userViHtml.includes(">thất vọng</span>"), "user VI must color thất vọng");
assert.ok(userViHtml.includes("tok-trans jlpt-n3") && userViHtml.includes(">cơ hội</span>"), "user VI must color cơ hội");
assert.ok(userViHtml.includes("tok-trans jlpt-n4") && userViHtml.includes(">tại sao</span>"), "user VI must color tại sao");
assert.ok(userViHtml.includes("tok-trans jlpt-n3") && userViHtml.includes(">còn trẻ</span>"), "user VI must color còn trẻ");
assert.ok(userViHtml.includes("tok-trans jlpt-n4") && userViHtml.includes(">như thế này</span>"), "user VI must color như thế này");
assert.ok(userViHtml.includes("tok-trans jlpt-n3") && userViHtml.includes(">những thông báo</span>"), "user VI must color những thông báo");

const userEnHtml = Vocab.renderBilingualHtml(userEn, "en", [], { enableBilingualJlptColor: true });
assert.ok(userEnHtml.includes("tok-trans jlpt-n5") && userEnHtml.includes(">that time</span>"), "user EN must color that time");
assert.ok(userEnHtml.includes("tok-trans jlpt-n3") && userEnHtml.includes(">frustrated</span>"), "user EN must color frustrated");
assert.ok(userEnHtml.includes("tok-trans jlpt-n4") && userEnHtml.includes(">why</span>"), "user EN must color why");
assert.ok(userEnHtml.includes("tok-trans jlpt-n3") && userEnHtml.includes(">opportunities</span>"), "user EN must color opportunities");
assert.ok(userEnHtml.includes("tok-trans jlpt-n4") && userEnHtml.includes(">like this</span>"), "user EN must color like this");
assert.ok(userEnHtml.includes("tok-trans jlpt-n3") && userEnHtml.includes(">make announcements</span>"), "user EN must color make announcements");

// Test 13: Grammar pattern clustering (e.g. について, 話します, 見てください)
const grammarCue = {
  tokens: [
    { surface: "日本語", lemma: "日本語", pos: "名詞", reading: "にほんご" },
    { surface: "に", lemma: "に", pos: "助詞", reading: "に" },
    { surface: "つい", lemma: "つく", pos: "動詞", reading: "つい" },
    { surface: "て", lemma: "て", pos: "助詞", reading: "て" },
    { surface: "話し", lemma: "話す", pos: "動詞", reading: "はなし" },
    { surface: "ます", lemma: "ます", pos: "助動詞", reading: "ます" },
  ],
};
const clusterRubyHtml = Vocab.renderRubyHtml(grammarCue, { showFurigana: false });
assert.ok(clusterRubyHtml.includes('data-cluster-surface="について"'), "Cluster について should be detected");
assert.ok(clusterRubyHtml.includes('data-cluster-surface="話します"'), "Verb inflection chain 話します should be clustered");
assert.ok(clusterRubyHtml.includes('data-cluster-lemma="話す"'), "Cluster lemma for 話します should be 話す");

// Test 14: Screenshot Card 1: Greetings (N5)
const card1Vi = Vocab.renderBilingualHtml("Chào buổi sáng, Chào buổi chiều, Chào buổi tối", "vi", [], { enableBilingualJlptColor: true });
assert.ok(card1Vi.includes("tok-trans jlpt-n5") && card1Vi.includes(">Chào buổi sáng</span>"), "Card 1: Chào buổi sáng should be jlpt-n5");
assert.ok(card1Vi.includes("tok-trans jlpt-n5") && card1Vi.includes(">Chào buổi chiều</span>"), "Card 1: Chào buổi chiều should be jlpt-n5");
assert.ok(card1Vi.includes("tok-trans jlpt-n5") && card1Vi.includes(">Chào buổi tối</span>"), "Card 1: Chào buổi tối should be jlpt-n5");

const card1En = Vocab.renderBilingualHtml("Good morning, Good afternoon, Good evening", "en", [], { enableBilingualJlptColor: true });
assert.ok(card1En.includes("tok-trans jlpt-n5") && card1En.includes(">Good morning</span>"), "Card 1: Good morning should be jlpt-n5");
assert.ok(card1En.includes("tok-trans jlpt-n5") && card1En.includes(">Good afternoon</span>"), "Card 1: Good afternoon should be jlpt-n5");
assert.ok(card1En.includes("tok-trans jlpt-n5") && card1En.includes(">Good evening</span>"), "Card 1: Good evening should be jlpt-n5");

// Test 15: Screenshot Card 2: video (N3), sự kiện (N3), gần đây (N3), ba (N5)
const card2Vi = Vocab.renderBilingualHtml("Trong video này, tôi sẽ nói về ba sự kiện gần đây.", "vi", [], { enableBilingualJlptColor: true });
assert.ok(card2Vi.includes("tok-trans jlpt-n3") && card2Vi.includes(">video</span>"), "Card 2: video should be jlpt-n3");
assert.ok(card2Vi.includes("tok-trans jlpt-n3") && card2Vi.includes(">sự kiện</span>"), "Card 2: sự kiện should be jlpt-n3");
assert.ok(card2Vi.includes("tok-trans jlpt-n3") && card2Vi.includes(">gần đây</span>"), "Card 2: gần đây should be jlpt-n3");
assert.ok(card2Vi.includes("tok-trans jlpt-n5") && card2Vi.includes(">ba</span>"), "Card 2: ba should be jlpt-n5");

const card2En = Vocab.renderBilingualHtml("In this video, I will talk about three recent events.", "en", [], { enableBilingualJlptColor: true });
assert.ok(card2En.includes("tok-trans jlpt-n3") && card2En.includes(">video</span>"), "Card 2 EN: video should be jlpt-n3");
assert.ok(card2En.includes("tok-trans jlpt-n3") && card2En.includes(">events</span>"), "Card 2 EN: events should be jlpt-n3");
assert.ok(card2En.includes("tok-trans jlpt-n3") && card2En.includes(">recent</span>"), "Card 2 EN: recent should be jlpt-n3");
assert.ok(card2En.includes("tok-trans jlpt-n5") && card2En.includes(">three</span>"), "Card 2 EN: three should be jlpt-n5");

// Test 16: Screenshot Card 3: trình độ (N3), JLPT (N3), từ đầu đến cuối (N3), mời (N5)
const card3Vi = Vocab.renderBilingualHtml("Bất kể trình độ JLPT nào, xin mời các bạn theo dõi từ đầu đến cuối.", "vi", [], { enableBilingualJlptColor: true });
assert.ok(card3Vi.includes("tok-trans jlpt-n3") && card3Vi.includes(">trình độ</span>"), "Card 3: trình độ should be jlpt-n3");
assert.ok(card3Vi.includes("tok-trans jlpt-n3") && card3Vi.includes(">JLPT</span>"), "Card 3: JLPT should be jlpt-n3");
assert.ok(card3Vi.includes("tok-trans jlpt-n3") && card3Vi.includes(">từ đầu đến cuối</span>"), "Card 3: từ đầu đến cuối should be jlpt-n3");
assert.ok(card3Vi.includes("tok-trans jlpt-n5") && card3Vi.includes(">xin mời</span>"), "Card 3: xin mời should be jlpt-n5");

const card3En = Vocab.renderBilingualHtml("Regardless of your JLPT level, please watch from beginning to end.", "en", [], { enableBilingualJlptColor: true });
assert.ok(card3En.includes("tok-trans jlpt-n3") && card3En.includes(">level</span>"), "Card 3 EN: level should be jlpt-n3");
assert.ok(card3En.includes("tok-trans jlpt-n3") && card3En.includes(">JLPT</span>"), "Card 3 EN: JLPT should be jlpt-n3");
assert.ok(card3En.includes("tok-trans jlpt-n3") && card3En.includes(">from beginning to end</span>"), "Card 3 EN: from beginning to end should be jlpt-n3");
// Test 17: User screenshot sentence full 100% color coverage:
// "Đó là một chuyện, nhưng tôi nghĩ đơn giản là vì Nhật Bản."
const userShotVi = "Đó là một chuyện, nhưng tôi nghĩ đơn giản là vì Nhật Bản.";
const userShotViHtml = Vocab.renderBilingualHtml(userShotVi, "vi", [
  { surface: "こと", lemma: "こと", jlpt: "n4" },
  { surface: "多分", lemma: "多分", jlpt: "n4" },
  { surface: "単純", lemma: "単純", jlpt: "n3" },
  { surface: "日本", lemma: "日本", jlpt: "n5" },
], { enableBilingualJlptColor: true });

assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">Đó</span>"), "Screenshot sentence: 'Đó' must have tok-trans color");
assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">chuyện</span>"), "Screenshot sentence: 'chuyện' must have tok-trans color");
assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">vì</span>"), "Screenshot sentence: 'vì' must have tok-trans color");
assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">đơn giản</span>"), "Screenshot sentence: 'đơn giản' must have tok-trans color");
assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">Nhật Bản</span>"), "Screenshot sentence: 'Nhật Bản' must have tok-trans color");

// Test 18: Compound Token Fusion (e.g. 週 + 末 -> 週末) and Cluster Wrapping
const splitTokens = [
  { surface: "さん", lemma: "さん", pos: "接尾辞" },
  { surface: "是非", lemma: "是非", pos: "副詞" },
  { surface: "素敵", reading: "すてき", lemma: "素敵", pos: "形状詞", jlpt: "n4" },
  { surface: "な", lemma: "だ", pos: "助動詞" },
  { surface: "週", reading: "シュウ", lemma: "週", pos: "名詞" },
  { surface: "末", reading: "マツ", lemma: "末", pos: "接尾辞" },
  { surface: "を", lemma: "を", pos: "助詞" },
  { surface: "送っ", reading: "おくっ", lemma: "送る", pos: "動詞", jlpt: "n4" },
  { surface: "て", lemma: "て", pos: "助詞" },
  { surface: "ください", reading: "ください", lemma: "くださる", pos: "動詞" },
  { surface: "ね", lemma: "ね", pos: "助詞" },
  { surface: "。", lemma: "。", pos: "補助記号" },
];

const fused = Vocab.fuseCompoundTokens(splitTokens);
assert.strictEqual(fused.some((t) => t.surface === "週末" && t.reading === "しゅうまつ"), true, "週 + 末 must be fused into 週末 with reading しゅうまつ");

const rubyRendered = Vocab.renderRubyHtml({ tokens: splitTokens }, { showFurigana: true });
assert.ok(rubyRendered.includes("tok-cluster-wrapper"), "Grammar clusters like 〜てください must be wrapped in tok-cluster-wrapper");
assert.ok(rubyRendered.includes("週末<rt>しゅうまつ</rt>"), "Fused 週末 must render as single ruby without gaps");

// Test 19: User's exact screenshot sentence: JA vs VI color & lemma match
// JA: さん是非素敵な週末を送ってくださいね。
// VI: Chúc bạn có một cuối tuần tuyệt vời!
const userSentenceVi = "Chúc bạn có một cuối tuần tuyệt vời!";
const userSentenceViHtml = Vocab.renderBilingualHtml(userSentenceVi, "vi", fused, { enableBilingualJlptColor: true });

assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="送る"') && userSentenceViHtml.includes(">Chúc bạn có một</span>"), "Cụm 'Chúc bạn có một' must be single token with jlpt-n4 matching 送る");
assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="週末"') && userSentenceViHtml.includes(">cuối tuần</span>"), "Cụm 'cuối tuần' must be single token with jlpt-n4 matching 週末");
assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="素敵"') && userSentenceViHtml.includes(">tuyệt vời</span>"), "Cụm 'tuyệt vời' must be single token with jlpt-n4 matching 素敵");

// Ensure no fragmented words
assert.strictEqual(userSentenceViHtml.includes(">chúc</span>"), false, "'chúc' must NOT be fragmented");
assert.strictEqual(userSentenceViHtml.includes(">bạn</span>"), false, "'bạn' must NOT be fragmented");
assert.strictEqual(userSentenceViHtml.includes(">có</span>"), false, "'có' must NOT be fragmented");
assert.strictEqual(userSentenceViHtml.includes(">một</span>"), false, "'một' must NOT be fragmented");
assert.strictEqual(userSentenceViHtml.includes(">cuối</span>"), false, "'cuối' must NOT be fragmented from 'tuần'");
assert.strictEqual(userSentenceViHtml.includes(">tuần</span>"), false, "'tuần' must NOT be fragmented from 'cuối'");
assert.strictEqual(userSentenceViHtml.includes(">tuyệt</span>"), false, "'tuyệt' must NOT be fragmented");
assert.strictEqual(userSentenceViHtml.includes(">vời</span>"), false, "'vời' must NOT be fragmented");

// Test 20: Cue 1 - Context-first mapping (Cảm ơn binds to お疲れ様, NOT ありがとう)
const cue1Tokens = [
  { surface: "皆", lemma: "皆", jlpt: "n5", pos: "名詞" },
  { surface: "さん", lemma: "さん", pos: "接尾辞" },
  { surface: "お疲れ様", lemma: "お疲れ様", jlpt: "n4", pos: "感動詞" },
  { surface: "です", lemma: "だ", jlpt: "n5", pos: "助動詞" },
  { surface: "。", lemma: "。", pos: "補助記号" },
  { surface: "鈴", lemma: "鈴", pos: "名詞" },
  { surface: "か", lemma: "か", pos: "助詞" },
  { surface: "です", lemma: "だ", jlpt: "n5", pos: "助動詞" },
  { surface: "。", lemma: "。", pos: "補助記号" },
  { surface: "鈴", lemma: "鈴", pos: "名詞" },
  { surface: "かの", lemma: "かの", pos: "助詞" },
];
const cue1Vi = "Cảm ơn mọi người vì sự nỗ lực hết mình. Đây là Suzuka. Suzukano";
const cue1Html = Vocab.renderBilingualHtml(cue1Vi, "vi", cue1Tokens, { enableBilingualJlptColor: true });

assert.ok(cue1Html.includes('data-lemma="お疲れ様"'), "Cue 1: 'Cảm ơn' must bind to お疲れ様, NOT ありがとう");
assert.strictEqual(cue1Html.includes('data-lemma="ありがとう"'), false, "Cue 1: 'ありがとう' must NOT hijack Cảm ơn");
assert.ok(cue1Html.includes(">mọi người</span>") && cue1Html.includes('data-lemma="皆"'), "Cue 1: 'mọi người' must bind to 皆");
assert.ok(cue1Html.includes(">sự nỗ lực hết mình</span>") || cue1Html.includes(">sự nỗ lực</span>"), "Cue 1: 'sự nỗ lực' must be unified compound");
assert.ok(cue1Html.includes(">Đây là</span>") || cue1Html.includes(">đây là</span>"), "Cue 1: 'Đây là' must be unified compound");
assert.ok(cue1Html.includes(">Suzuka</span>"), "Cue 1: 'Suzuka' must be preserved and highlighted");
assert.ok(cue1Html.includes(">Suzukano</span>"), "Cue 1: 'Suzukano' must be preserved and highlighted");

// Test 21: Cue 2 - Full compound preservation (Chào mừng is NOT broken into Chào + mừng)
const cue2Tokens = [
  { surface: "ポッドキャスト", lemma: "ポッドキャスト", jlpt: "n4", pos: "名詞" },
  { surface: "へ", lemma: "へ", jlpt: "n5", pos: "助詞" },
  { surface: "ようこそ", lemma: "ようこそ", jlpt: "n4", pos: "感動詞" },
  { surface: "。", lemma: "。", pos: "補助記号" },
];
const cue2Vi = "Chào mừng các bạn đến với podcast.";
const cue2Html = Vocab.renderBilingualHtml(cue2Vi, "vi", cue2Tokens, { enableBilingualJlptColor: true });

assert.ok(cue2Html.includes(">Chào mừng</span>") && cue2Html.includes('data-lemma="ようこそ"'), "Cue 2: 'Chào mừng' must be unified token with lemma ようこそ");
assert.strictEqual(cue2Html.includes(">mừng</span>"), false, "Cue 2: 'mừng' must NOT be stranded as white orphan text");
assert.ok(cue2Html.includes(">các bạn</span>"), "Cue 2: 'các bạn' must be unified token");
assert.ok(cue2Html.includes(">đến với</span>"), "Cue 2: 'đến với' must be unified token");
assert.ok(cue2Html.includes(">podcast</span>") && cue2Html.includes('data-lemma="ポッドキャスト"'), "Cue 2: 'podcast' must match loanword ポッドキャスト");

// Test 22: Cue 3 - Entire sentence scanning with zero plain white content words
const cue3Tokens = [
  { surface: "今週", lemma: "今週", jlpt: "n5", pos: "名詞" },
  { surface: "も", lemma: "も", jlpt: "n5", pos: "助詞" },
  { surface: "1週間", lemma: "1週間", jlpt: "n5", pos: "名詞" },
  { surface: "本当", lemma: "本当", jlpt: "n4", pos: "副詞" },
  { surface: "に", lemma: "に", jlpt: "n5", pos: "助詞" },
  { surface: "お疲れ様", lemma: "お疲れ様", jlpt: "n4", pos: "感動詞" },
  { surface: "でし", lemma: "だ", jlpt: "n5", pos: "助動詞" },
  { surface: "た", lemma: "た", jlpt: "n5", pos: "助動詞" },
  { surface: "。", lemma: "。", pos: "補助記号" },
  { surface: "皆", lemma: "皆", jlpt: "n5", pos: "名詞" },
];
const cue3Vi = "Cảm ơn bạn rất nhiều vì tất cả sự nỗ lực của bạn trong tuần này. tất cả";
const cue3Html = Vocab.renderBilingualHtml(cue3Vi, "vi", cue3Tokens, { enableBilingualJlptColor: true });

assert.ok(cue3Html.includes('data-lemma="お疲れ様"'), "Cue 3: 'Cảm ơn bạn' must bind to お疲れ様");
assert.ok(cue3Html.includes(">rất nhiều</span>") && cue3Html.includes('data-lemma="本当"'), "Cue 3: 'rất nhiều' must bind to 本当");
assert.ok(cue3Html.includes(">tất cả</span>") && cue3Html.includes('data-lemma="皆"'), "Cue 3: 'tất cả' must bind to 皆");
assert.ok(cue3Html.includes(">trong tuần này</span>") || (cue3Html.includes(">tuần này</span>") && cue3Html.includes('data-lemma="今週"')), "Cue 3: 'tuần này' must bind to 今週");
assert.ok(cue3Html.includes(">sự nỗ lực của bạn</span>") || cue3Html.includes(">sự nỗ lực</span>"), "Cue 3: 'sự nỗ lực' must be unified compound");

// Test 23: Whitespace-tolerant compound fusion (週 + 　 + 末 -> 週末)
const spacedTokens = [
  { surface: "週", reading: "シュウ", lemma: "週", pos: "名詞" },
  { surface: "　", reading: "", lemma: "　", pos: "空白" },
  { surface: "末", reading: "マツ", lemma: "末", pos: "接尾辞" },
];
const fusedSpaced = Vocab.fuseCompoundTokens(spacedTokens);
assert.strictEqual(fusedSpaced.length, 1, "Whitespace between 週 and 末 must be collapsed");
assert.strictEqual(fusedSpaced[0].surface, "週末", "Fused token surface must be 週末");
assert.strictEqual(fusedSpaced[0].reading, "しゅうまつ", "Fused token reading must be しゅうまつ");

// Test 24: Cue 5 - Dynamic color matching, anti-clumping, and zero blanket green
const cue5Tokens = [
  { surface: "住み", lemma: "住む", jlpt: "n5", pos: "動詞" },
  { surface: "始め", lemma: "始める", jlpt: "n4", pos: "動詞" },
  { surface: "て", lemma: "て", pos: "助詞" },
  { surface: "から", lemma: "から", jlpt: "n5", pos: "助詞" },
  { surface: "自分", lemma: "自分", jlpt: "n4", pos: "代名詞" },
  { surface: "で", lemma: "で", pos: "助詞" },
  { surface: "も", lemma: "も", jlpt: "n5", pos: "助詞" },
  { surface: "びっくり", lemma: "びっくり", jlpt: "n3", pos: "副詞" },
  { surface: "する", lemma: "する", jlpt: "n5", pos: "動詞" },
  { surface: "くらい", lemma: "くらい", jlpt: "n4", pos: "助詞" },
];
const cue5Vi = "Tôi cũng ngạc nhiên sau khi bắt đầu.";
const cue5Html = Vocab.renderBilingualHtml(cue5Vi, "vi", cue5Tokens, { enableBilingualJlptColor: true });

assert.ok(cue5Html.includes(">Tôi</span>") && cue5Html.includes('tok-other-pos') && cue5Html.includes('data-lemma="自分"'), "Cue 5: 'Tôi' must be other-pos bound to 自分");
assert.ok(cue5Html.includes(">ngạc nhiên</span>") && cue5Html.includes('tok-other-pos') && cue5Html.includes('data-lemma="びっくり"'), "Cue 5: 'ngạc nhiên' must be other-pos bound to びっくり");
assert.ok(cue5Html.includes(">sau khi</span>") && cue5Html.includes('jlpt-n5'), "Cue 5: 'sau khi' must be separate token with JLPT N5");
assert.ok(cue5Html.includes(">bắt đầu</span>") && cue5Html.includes('jlpt-n4') && cue5Html.includes('data-lemma="始める"'), "Cue 5: 'bắt đầu' must be separate token bound to 始める with JLPT N4");
assert.strictEqual(cue5Html.includes(">sau khi bắt đầu</span>"), false, "Cue 5: 'sau khi' and 'bắt đầu' must NOT be clumped together");

// Test 25: Vấn đề 3 & 4 - チョコ -> 'sô cô la' compound unification & 1-to-1 JLPT color inheritance
const chocoTokens = [
  { surface: "チョコ", lemma: "チョコ", jlpt: "n5", pos: "名詞" },
  { surface: "を", lemma: "を", pos: "助詞" },
  { surface: "食べ", lemma: "食べる", jlpt: "n5", pos: "動詞" },
  { surface: "ます", lemma: "ます", pos: "助動詞" },
];
const chocoVi = "Tôi ăn sô cô la.";
const chocoHtml = Vocab.renderBilingualHtml(chocoVi, "vi", chocoTokens, { enableBilingualJlptColor: true });

assert.ok(chocoHtml.includes(">sô cô la</span>"), "チョコ: 'sô cô la' must be unified into ONE single compound token");
assert.strictEqual(chocoHtml.includes(">sô</span>"), false, "チョコ: 'sô' must NOT be isolated");
assert.strictEqual(chocoHtml.includes(">cô</span>"), false, "チョコ: 'cô' must NOT be isolated");
assert.strictEqual(chocoHtml.includes(">la</span>"), false, "チョコ: 'la' must NOT be isolated");
assert.ok(chocoHtml.includes('class="tok-trans jlpt-n5" data-lemma="チョコ" data-surface="チョコ" title="[JLPT N5] チョコ">sô cô la</span>'), "チョコ: 'sô cô la' must inherit exact JLPT N5 color from チョコ");
assert.ok(chocoHtml.includes('class="tok-trans jlpt-n5" data-lemma="食べる" data-surface="食べます" title="[JLPT N5] 食べます">ăn</span>'), " ăn must inherit JLPT N5 verb color from 食べます");

// Test 26: POS differentiation invariant - Noun/Verb/Adj (jlpt-*) vs other content (tok-other-pos) vs particles (neutral)
const posTestTokens = [
  { surface: "猫", lemma: "猫", jlpt: "n5", pos: "名詞" },
  { surface: "が", lemma: "が", pos: "助詞" },
  { surface: "速く", lemma: "速い", jlpt: "n5", pos: "形容詞" },
  { surface: "走る", lemma: "走る", jlpt: "n5", pos: "動詞" },
  { surface: "とても", lemma: "とても", jlpt: "n5", pos: "副詞" },
];
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[0]), "jlpt-n5", "Noun must get jlpt-n5");
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[1]), "", "Particle must get empty class (neutral)");
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[2]), "jlpt-n5", "Adjective must get jlpt-n5");
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[3]), "jlpt-n5", "Verb must get jlpt-n5");
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[4]), "tok-other-pos", "Adverb must get tok-other-pos");

console.log("All vocab_style fallback, compound fusion, bilingual JLPT, and POS differentiation tests passed!");
