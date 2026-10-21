const assert = require("assert");
require("./vocab_style.js");

const Vocab = globalThis.HardsubVocab;
// Inspect production helper output, never source-file text. Real DOM checks are separate.
const renderedText = html => html.replace(/<rt>.*?<\/rt>/gu, "").replace(/<[^>]*>/gu, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

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
// Regression: duplicate BILINGUAL_MAP keys without `level` used to overwrite the
// leveled entries, so these words lost their JLPT band entirely.
assert.strictEqual(Vocab.jlptLevel({ surface: "だす", lemma: "だす" }), "n4", "だす should map to n4");
assert.strictEqual(Vocab.jlptLevel({ surface: "たい", lemma: "たい" }), "n5", "たい should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "欲しい", lemma: "欲しい" }), "n5", "欲しい should map to n5");
assert.strictEqual(Vocab.jlptLevel({ surface: "ほしい", lemma: "ほしい" }), "n5", "ほしい should map to n5");

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
assert.ok(enWatashi.includes('class="tok-trans jlpt-n5" data-lemma="わたし" data-surface="わたし" title="[JLPT N5] わたし">I</span>'), "English single letter I should be highlighted");
assert.ok(enWatashi.includes('>I</span>'), "English I should be wrapped");

// Test 9: Vietnamese accented words matching Unicode boundaries
const viAccented = Vocab.renderBilingualHtml("Chào bạn bè và tôi", "vi", [
  { surface: "友達", lemma: "友達", pos: "名詞" },
  { surface: "私", lemma: "私", pos: "代名詞" }
], { enableBilingualJlptColor: true });
assert.ok(viAccented.includes('class="tok-trans jlpt-n5"') && viAccented.includes('>bạn bè</span>'), "Vietnamese friend with accent should be highlighted");
assert.ok(viAccented.includes('class="tok-trans jlpt-n5" data-lemma="私" data-surface="私" title="[JLPT N5] 私">tôi</span>'), "Vietnamese tôi with accent should be highlighted");

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

// Test 11: Missing token input must not fabricate bilingual JLPT alignment
const viDirectOnly = Vocab.renderBilingualHtml("Chào bạn bè và gia đình", "vi", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(viDirectOnly), "Chào bạn bè và gia đình", "No-source rendering preserves every character");
assert.ok(!viDirectOnly.includes("jlpt-") && !viDirectOnly.includes("data-lemma=\"家族\"") && renderedText(viDirectOnly).includes('bạn bè'), "Without active JA tokens: bạn bè stays neutral and text is preserved");
assert.ok(!viDirectOnly.includes("jlpt-") && !viDirectOnly.includes("data-lemma=\"家族\"") && renderedText(viDirectOnly).includes('gia đình'), "Without active JA tokens: gia đình stays neutral and text is preserved");

const enDirectOnly = Vocab.renderBilingualHtml("Hello my friend and family", "en", null, { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(enDirectOnly), "Hello my friend and family", "No-source rendering preserves every character");
assert.ok(!enDirectOnly.includes("jlpt-") && !enDirectOnly.includes("data-lemma=\"家族\"") && renderedText(enDirectOnly).includes('friend'), "Without active JA tokens: friend stays neutral and text is preserved");
assert.ok(!enDirectOnly.includes("jlpt-") && !enDirectOnly.includes("data-lemma=\"家族\"") && renderedText(enDirectOnly).includes('family'), "Without active JA tokens: family stays neutral and text is preserved");

// Test 12: User's exact sentence from real video
const userVi = "Lúc đó, tôi cảm thấy vô cùng thất vọng, tự hỏi tại sao mình lại không nhận được bất kỳ cơ hội nào chỉ vì mình còn trẻ. Tôi muốn thử những việc như thế này, và tôi cũng muốn đưa ra những thông báo như thế này.";
const userEn = "that time, I felt incredibly frustrated, wondering why I didn't get any opportunities just because I was young. I'd like to try things like this, and I'd also like to make announcements like this.";

const userViHtml = Vocab.renderBilingualHtml(userVi, "vi", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(userViHtml), userVi, "No-source rendering preserves every character");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('Lúc đó'), "Without active JA tokens: Lúc đó stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('tôi'), "Without active JA tokens: tôi stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('thất vọng'), "Without active JA tokens: thất vọng stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('cơ hội'), "Without active JA tokens: cơ hội stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('tại sao'), "Without active JA tokens: tại sao stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('còn trẻ'), "Without active JA tokens: còn trẻ stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('như thế này'), "Without active JA tokens: như thế này stays neutral and text is preserved");
assert.ok(!userViHtml.includes("jlpt-") && !userViHtml.includes("data-lemma=\"家族\"") && renderedText(userViHtml).includes('những thông báo'), "Without active JA tokens: những thông báo stays neutral and text is preserved");

const userEnHtml = Vocab.renderBilingualHtml(userEn, "en", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(userEnHtml), userEn, "No-source rendering preserves every character");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('that time'), "Without active JA tokens: that time stays neutral and text is preserved");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('frustrated'), "Without active JA tokens: frustrated stays neutral and text is preserved");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('why'), "Without active JA tokens: why stays neutral and text is preserved");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('opportunities'), "Without active JA tokens: opportunities stays neutral and text is preserved");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('like this'), "Without active JA tokens: like this stays neutral and text is preserved");
assert.ok(!userEnHtml.includes("jlpt-") && !userEnHtml.includes("data-lemma=\"家族\"") && renderedText(userEnHtml).includes('make announcements'), "Without active JA tokens: make announcements stays neutral and text is preserved");

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
assert.strictEqual(renderedText(card1Vi), "Chào buổi sáng, Chào buổi chiều, Chào buổi tối", "No-source rendering preserves every character");
assert.ok(!card1Vi.includes("jlpt-") && !card1Vi.includes("data-lemma=\"家族\"") && renderedText(card1Vi).includes('Chào buổi sáng'), "Without active JA tokens: Chào buổi sáng stays neutral and text is preserved");
assert.ok(!card1Vi.includes("jlpt-") && !card1Vi.includes("data-lemma=\"家族\"") && renderedText(card1Vi).includes('Chào buổi chiều'), "Without active JA tokens: Chào buổi chiều stays neutral and text is preserved");
assert.ok(!card1Vi.includes("jlpt-") && !card1Vi.includes("data-lemma=\"家族\"") && renderedText(card1Vi).includes('Chào buổi tối'), "Without active JA tokens: Chào buổi tối stays neutral and text is preserved");

const card1En = Vocab.renderBilingualHtml("Good morning, Good afternoon, Good evening", "en", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(card1En), "Good morning, Good afternoon, Good evening", "No-source rendering preserves every character");
assert.ok(!card1En.includes("jlpt-") && !card1En.includes("data-lemma=\"家族\"") && renderedText(card1En).includes('Good morning'), "Without active JA tokens: Good morning stays neutral and text is preserved");
assert.ok(!card1En.includes("jlpt-") && !card1En.includes("data-lemma=\"家族\"") && renderedText(card1En).includes('Good afternoon'), "Without active JA tokens: Good afternoon stays neutral and text is preserved");
assert.ok(!card1En.includes("jlpt-") && !card1En.includes("data-lemma=\"家族\"") && renderedText(card1En).includes('Good evening'), "Without active JA tokens: Good evening stays neutral and text is preserved");

// Test 15: Screenshot Card 2: video (N3), sự kiện (N3), gần đây (N3), ba (N5)
const card2Vi = Vocab.renderBilingualHtml("Trong video này, tôi sẽ nói về ba sự kiện gần đây.", "vi", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(card2Vi), "Trong video này, tôi sẽ nói về ba sự kiện gần đây.", "No-source rendering preserves every character");
assert.ok(!card2Vi.includes("jlpt-") && !card2Vi.includes("data-lemma=\"家族\"") && renderedText(card2Vi).includes('video'), "Without active JA tokens: video stays neutral and text is preserved");
assert.ok(!card2Vi.includes("jlpt-") && !card2Vi.includes("data-lemma=\"家族\"") && renderedText(card2Vi).includes('sự kiện'), "Without active JA tokens: sự kiện stays neutral and text is preserved");
assert.ok(!card2Vi.includes("jlpt-") && !card2Vi.includes("data-lemma=\"家族\"") && renderedText(card2Vi).includes('gần đây'), "Without active JA tokens: gần đây stays neutral and text is preserved");
assert.ok(!card2Vi.includes("jlpt-") && !card2Vi.includes("data-lemma=\"家族\"") && renderedText(card2Vi).includes('ba'), "Without active JA tokens: ba stays neutral and text is preserved");

const card2En = Vocab.renderBilingualHtml("In this video, I will talk about three recent events.", "en", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(card2En), "In this video, I will talk about three recent events.", "No-source rendering preserves every character");
assert.ok(!card2En.includes("jlpt-") && !card2En.includes("data-lemma=\"家族\"") && renderedText(card2En).includes('video'), "Without active JA tokens: video stays neutral and text is preserved");
assert.ok(!card2En.includes("jlpt-") && !card2En.includes("data-lemma=\"家族\"") && renderedText(card2En).includes('events'), "Without active JA tokens: events stays neutral and text is preserved");
assert.ok(!card2En.includes("jlpt-") && !card2En.includes("data-lemma=\"家族\"") && renderedText(card2En).includes('recent'), "Without active JA tokens: recent stays neutral and text is preserved");
assert.ok(!card2En.includes("jlpt-") && !card2En.includes("data-lemma=\"家族\"") && renderedText(card2En).includes('three'), "Without active JA tokens: three stays neutral and text is preserved");

// Test 16: Screenshot Card 3: trình độ (N3), JLPT (N3), từ đầu đến cuối (N3), mời (N5)
const card3Vi = Vocab.renderBilingualHtml("Bất kể trình độ JLPT nào, xin mời các bạn theo dõi từ đầu đến cuối.", "vi", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(card3Vi), "Bất kể trình độ JLPT nào, xin mời các bạn theo dõi từ đầu đến cuối.", "No-source rendering preserves every character");
assert.ok(!card3Vi.includes("jlpt-") && !card3Vi.includes("data-lemma=\"家族\"") && renderedText(card3Vi).includes('trình độ'), "Without active JA tokens: trình độ stays neutral and text is preserved");
assert.ok(!card3Vi.includes("jlpt-") && !card3Vi.includes("data-lemma=\"家族\"") && renderedText(card3Vi).includes('JLPT'), "Without active JA tokens: JLPT stays neutral and text is preserved");
assert.ok(!card3Vi.includes("jlpt-") && !card3Vi.includes("data-lemma=\"家族\"") && renderedText(card3Vi).includes('từ đầu đến cuối'), "Without active JA tokens: từ đầu đến cuối stays neutral and text is preserved");
assert.ok(!card3Vi.includes("jlpt-") && !card3Vi.includes("data-lemma=\"家族\"") && renderedText(card3Vi).includes('xin mời'), "Without active JA tokens: xin mời stays neutral and text is preserved");

const card3En = Vocab.renderBilingualHtml("Regardless of your JLPT level, please watch from beginning to end.", "en", [], { enableBilingualJlptColor: true });
assert.strictEqual(renderedText(card3En), "Regardless of your JLPT level, please watch from beginning to end.", "No-source rendering preserves every character");
assert.ok(!card3En.includes("jlpt-") && !card3En.includes("data-lemma=\"家族\"") && renderedText(card3En).includes('level'), "Without active JA tokens: level stays neutral and text is preserved");
assert.ok(!card3En.includes("jlpt-") && !card3En.includes("data-lemma=\"家族\"") && renderedText(card3En).includes('JLPT'), "Without active JA tokens: JLPT stays neutral and text is preserved");
assert.ok(!card3En.includes("jlpt-") && !card3En.includes("data-lemma=\"家族\"") && renderedText(card3En).includes('from beginning to end'), "Without active JA tokens: from beginning to end stays neutral and text is preserved");
// Test 17: Active-source alignment; unmatched words remain neutral:
// "Đó là một chuyện, nhưng tôi nghĩ đơn giản là vì Nhật Bản."
const userShotVi = "Đó là một chuyện, nhưng tôi nghĩ đơn giản là vì Nhật Bản.";
const userShotViHtml = Vocab.renderBilingualHtml(userShotVi, "vi", [
  { surface: "こと", lemma: "こと", jlpt: "n4" },
  { surface: "多分", lemma: "多分", jlpt: "n4" },
  { surface: "単純", lemma: "単純", jlpt: "n3" },
  { surface: "日本", lemma: "日本", jlpt: "n5" },
], { enableBilingualJlptColor: true });

assert.ok(renderedText(userShotViHtml).includes("Đó") && !userShotViHtml.includes('data-lemma="それ"'), "Screenshot sentence: 'Đó' must have tok-trans color");
assert.ok(userShotViHtml.includes("tok-trans") && userShotViHtml.includes(">chuyện</span>"), "Screenshot sentence: 'chuyện' must have tok-trans color");
assert.ok(renderedText(userShotViHtml).includes("vì") && !userShotViHtml.includes('data-lemma="から"'), "Screenshot sentence: 'vì' must have tok-trans color");
assert.ok(userShotViHtml.includes('class="tok-trans jlpt-n3" data-lemma="単純"') && userShotViHtml.includes(">đơn giản</span>"), "Screenshot sentence: 'đơn giản' inherits N3 from 単純");
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

assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="送る"') && userSentenceViHtml.includes(">Chúc</span>") && !userSentenceViHtml.includes(">Chúc bạn có một</span>"), "Only Chúc may align with 送る; pronouns and auxiliaries remain separate");
assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="週末"') && userSentenceViHtml.includes(">cuối tuần</span>"), "Cụm 'cuối tuần' must be single token with jlpt-n4 matching 週末");
assert.ok(userSentenceViHtml.includes('class="tok-trans jlpt-n4" data-lemma="素敵"') && userSentenceViHtml.includes(">tuyệt vời</span>"), "Cụm 'tuyệt vời' must be single token with jlpt-n4 matching 素敵");

// Ensure no fragmented words
assert.ok(!userSentenceViHtml.includes(">Chúc bạn có một</span>") && renderedText(userSentenceViHtml).toLowerCase().includes("chúc"), "chúc remains independent and preserves text");
assert.ok(!userSentenceViHtml.includes(">Chúc bạn có một</span>") && renderedText(userSentenceViHtml).toLowerCase().includes("bạn"), "bạn remains independent and preserves text");
assert.ok(!userSentenceViHtml.includes(">Chúc bạn có một</span>") && renderedText(userSentenceViHtml).toLowerCase().includes("có"), "có remains independent and preserves text");
assert.ok(!userSentenceViHtml.includes(">Chúc bạn có một</span>") && renderedText(userSentenceViHtml).toLowerCase().includes("một"), "một remains independent and preserves text");
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
assert.ok(renderedText(cue1Html).includes("Đây là") && !cue1Html.includes(">Đây là</span>"), "Đây and là remain separate with exact text");
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
assert.strictEqual(cue2Html.includes(">các bạn</span>"), false, "Unmatched 'các bạn' has no active Japanese cue and stays neutral");
assert.ok(renderedText(cue2Html).includes("các bạn"), "Cue 2 preserves the unmatched 'các bạn' text");
assert.strictEqual(cue2Html.includes(">đến với</span>"), false, "Standalone particle へ is not grouped into a bilingual phrase");
assert.ok(renderedText(cue2Html).includes("đến với"), "Cue 2 preserves the neutral particle translation");
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

// Test 23: Source whitespace is authoritative (週 + 　 + 末 remains 週　末)
const spacedTokens = [
  { surface: "週", reading: "シュウ", lemma: "週", pos: "名詞" },
  { surface: "　", reading: "", lemma: "　", pos: "空白" },
  { surface: "末", reading: "マツ", lemma: "末", pos: "接尾辞" },
];
const fusedSpaced = Vocab.fuseCompoundTokens(spacedTokens);
assert.strictEqual(fusedSpaced.length, 3, "Whitespace between 週 and 末 must be preserved");
assert.strictEqual(fusedSpaced.map(t => t.surface).join(""), "週　末", "Exact source surfaces remain authoritative");
assert.deepStrictEqual(fusedSpaced, spacedTokens, "Whitespace-separated tokens retain all metadata");

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

assert.ok(cue5Html.includes(">Tôi</span>") && cue5Html.includes('class="tok-trans jlpt-n4" data-lemma="自分"'), "Tôi inherits active 自分 N4");
assert.ok(cue5Html.includes(">ngạc nhiên</span>") && cue5Html.includes('class="tok-trans jlpt-n3" data-lemma="びっくり"'), "ngạc nhiên inherits active びっくり N3");
assert.strictEqual(cue5Html.includes(">sau khi</span>"), false, "No validated てから cluster: sau khi remains neutral");
assert.ok(renderedText(cue5Html).includes("sau khi"), "Neutral sau khi text is preserved");
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
assert.strictEqual(Vocab.jlptClassForToken(posTestTokens[4]), "jlpt-n5", "Known adverb level must win over POS");

// Renderers must leave source spans and cached token objects authoritative.
const sourceCue = {source: "週末送って", tokens: [
  {surface: "週", lemma: "週", pos: "名詞", start: 0, end: 1, offsetUnit: "utf16", sourceRefs: [{cueId: "a", charStart: 0, charEnd: 1}]},
  {surface: "末", lemma: "末", pos: "接尾辞", start: 1, end: 2, offsetUnit: "utf16", sourceRefs: [{cueId: "a", charStart: 1, charEnd: 2}]},
  {surface: "送っ", lemma: "送る", pos: "動詞", jlpt: "n2", start: 2, end: 4, offsetUnit: "utf16", sourceRefs: [{cueId: "a", charStart: 2, charEnd: 4}]},
  {surface: "て", lemma: "て", pos: "助詞", start: 4, end: 5, offsetUnit: "utf16", sourceRefs: [{cueId: "a", charStart: 4, charEnd: 5}]},
]};
const sourceBefore = structuredClone(sourceCue);
assert.strictEqual(renderedText(Vocab.renderRubyHtml(sourceCue)), sourceCue.source);
assert.deepStrictEqual(sourceCue, sourceBefore, "Ruby rendering leaves the cue and source refs unchanged");
const sourceVi = Vocab.renderBilingualHtml("cuối tuần gửi", "vi", sourceCue.tokens, {});
assert.deepStrictEqual(sourceCue, sourceBefore, "Bilingual rendering leaves the cue unchanged");
assert.ok(sourceVi.includes('class="tok-trans jlpt-n2" data-lemma="送る"'), "Inflected root level wins over dictionary default");
const fusedSource = Vocab.fuseCompoundTokens(sourceCue.tokens);
assert.strictEqual(fusedSource[0].start, 0);
assert.strictEqual(fusedSource[0].end, 2);
assert.strictEqual(fusedSource[0].offsetUnit, "utf16");
assert.deepStrictEqual(fusedSource[0].sourceRefs, sourceCue.tokens.slice(0, 2).flatMap(t => t.sourceRefs));
assert.strictEqual(Vocab.fuseCompoundTokens([{...sourceCue.tokens[0]}, {...sourceCue.tokens[1], start: 9}]).length, 2, "Noncontiguous source offsets cannot fuse");
assert.strictEqual(Vocab.renderRubyHtml({source: "週 末", tokens: sourceCue.tokens.slice(0, 2)}), "週 末", "Incomplete token coverage falls back to exact source");
for (const input of [[], null, [{surface: "猫", lemma: "猫", jlpt: "n4", pos: "名詞"}]]) {
  const unsafe = '<img src=x onerror=alert(1)> & family';
  const html = Vocab.renderBilingualHtml(unsafe, "en", input, {});
  assert.strictEqual(html, '&lt;img src=x onerror=alert(1)&gt; &amp; family', "Unmapped text is escaped without fabricated alignment");
}
assert.strictEqual(Vocab.jlptLevel({surface: "Zéphyr", lemma: "Zéphyr", pos: "名詞", freq_rank: 1}), "", "Frequency is not a JLPT assignment");
assert.strictEqual(Vocab.jlptClassForToken({surface: "鈴か", lemma: "鈴か", pos: "名詞"}), "", "Unknown names have no JLPT class");
const stale = [{surface: "自分", lemma: "自分", pos: "代名詞", jlpt: "n2", _clusterLevel: "n5", _clusterLemma: "私"}];
const staleBefore = structuredClone(stale);
assert.ok(Vocab.renderBilingualHtml("Tôi", "vi", stale, {}).includes('class="tok-trans jlpt-n2" data-lemma="自分"'), "Stale renderer annotations cannot override active levels");
assert.deepStrictEqual(stale, staleBefore);

const rangeTokens = [{surface:"最初", lemma:"最初", jlpt:"n3", pos:"名詞"}, {surface:"から", lemma:"から", pos:"助詞"}, {surface:"最後", lemma:"最後", jlpt:"n4", pos:"名詞"}, {surface:"まで", lemma:"まで", pos:"助詞"}];
const rangeHtml = Vocab.renderBilingualHtml("từ đầu đến cuối", "vi", rangeTokens, {});
assert.strictEqual(rangeHtml.includes(">từ đầu đến cuối</span>"), false, "Two distinct content lemmas cannot clump into one sentence span");
assert.ok(rangeHtml.includes('class="tok-trans jlpt-n3" data-lemma="最初" data-surface="最初" title="[JLPT N3] 最初">đầu</span>'));
assert.ok(rangeHtml.includes('class="tok-trans jlpt-n4" data-lemma="最後" data-surface="最後" title="[JLPT N4] 最後">cuối</span>'));
assert.strictEqual(renderedText(rangeHtml), "từ đầu đến cuối");

const noCueVi = "Cuối tuần";
assert.strictEqual(Vocab.renderBilingualHtml(noCueVi, "vi", [], {}), noCueVi, "Vietnamese phrases without an active Japanese cue stay plain text");

const grammarTokens = [
  { surface: "こと", lemma: "こと", jlpt: "n4", pos: "名詞" },
  { surface: "に", lemma: "に", pos: "助詞" },
  { surface: "なっ", lemma: "なる", pos: "動詞" },
  { surface: "て", lemma: "て", pos: "助詞" },
  { surface: "いる", lemma: "いる", pos: "動詞" },
];
const grammarHtml = Vocab.renderBilingualHtml("This is scheduled to change", "en", grammarTokens, {});
assert.ok(grammarHtml.includes('class="tok-trans jlpt-n3" data-lemma="こと" data-surface="ことになっている" title="[JLPT N3] ことになっている">is scheduled to</span>'), "A matched grammar cluster uses its declared JLPT level");

// Auxiliary words and competing active aliases must not acquire guessed alignment.
const politeTalk = [{surface:"話します", lemma:"話します", jlpt:"n2", pos:"動詞"}];
for (const [lang,text,compound,word] of [["vi","Tôi sẽ nói.","sẽ nói","nói"],["en","I will talk.","will talk","talk"]]) {
  const html = Vocab.renderBilingualHtml(text,lang,politeTalk,{});
  assert.strictEqual(renderedText(html),text);
  assert.ok(!html.includes(`>${compound}</span>`), "Auxiliary remains separate from the lexical verb");
  assert.ok(html.includes(`>${word}</span>`));
  assert.ok(html.includes('class="tok-trans jlpt-n2"'));
}
const competing = [{surface:"私",lemma:"私",jlpt:"n5",pos:"代名詞"},{surface:"自分",lemma:"自分",jlpt:"n4",pos:"代名詞"}];
for (const tokens of [competing,[...competing].reverse(),[...competing,competing[0]]]) {
  const before = structuredClone(tokens);
  for (const [lang,text] of [["vi","Tôi nhớ bản thân."],["en","I remember myself."]]) {
    const html = Vocab.renderBilingualHtml(text,lang,tokens,{});
    assert.strictEqual(renderedText(html),text);
    assert.ok(!html.includes('>Tôi</span>') && !html.includes('>I</span>') && !html.includes('>myself</span>'), "Conflicting active aliases stay neutral regardless of token order");
    if(lang==="vi") assert.ok(html.includes('class="tok-trans jlpt-n4" data-lemma="自分"') && html.includes('>bản thân</span>'), "Distinct active alias remains mapped");
  }
  assert.deepStrictEqual(tokens,before);
}
const differentLevels = [{surface:"自分",lemma:"自分",jlpt:"n4",pos:"代名詞"},{surface:"自分",lemma:"自分",jlpt:"n2",pos:"代名詞"}];
for(const tokens of [differentLevels,[...differentLevels].reverse()]) assert.strictEqual(Vocab.renderBilingualHtml("Tôi","vi",tokens,{}),"Tôi", "Same-lemma level conflicts stay neutral");
const repeatedSelf = [competing[1],{...competing[1]}];
assert.ok(Vocab.renderBilingualHtml("Tôi","vi",repeatedSelf,{}).includes('class="tok-trans jlpt-n4" data-lemma="自分"'), "Repeated unambiguous aliases keep their active level");

const wishTokens = [{surface:"て",lemma:"て",pos:"助詞"},{surface:"ほしい",lemma:"ほしい",pos:"形容詞",jlpt:"n4"}];
const wishClause = "I want someone to do this.";
assert.strictEqual(Vocab.renderBilingualHtml(wishClause,"en",wishTokens,{}),wishClause, "A pronoun and lexical action are not one grammar alias");

// Test: Karaoke word highlighting
const karaokeCue = {
  source: "乗せてないんですか？",
  tokens: [
    { surface: "乗せて", reading: "のせて", lemma: "乗せる", pos: "動詞", start: 60.12, end: 60.85 },
    { surface: "ないん", reading: "ないん", lemma: "ない", pos: "助動詞", start: 60.85, end: 61.30 },
    { surface: "ですか", reading: "ですか", lemma: "です", pos: "助動詞", start: 61.30, end: 61.90 },
    { surface: "？", reading: "", lemma: "？", pos: "補助記号", start: 61.90, end: 62.45 },
  ],
  words: [
    { word: "乗せて", start: 60.12, end: 60.85 },
    { word: "ないん", start: 60.85, end: 61.30 },
    { word: "ですか", start: 61.30, end: 61.90 },
    { word: "？", start: 61.90, end: 62.45 },
  ]
};
const inactiveHtml = Vocab.renderRubyHtml(karaokeCue, { currentTime: 50.0 });
assert.ok(!inactiveHtml.includes("tok-karaoke-active"), "Inactive time should not have tok-karaoke-active");

const activeWord1 = Vocab.renderRubyHtml(karaokeCue, { currentTime: 60.50 });
assert.ok(activeWord1.includes("tok-karaoke-active"), "Active time should have tok-karaoke-active");
assert.ok(activeWord1.includes("乗せて"), "Active word should be rendered with furigana/ruby");

const activeWord2 = Vocab.renderRubyHtml(karaokeCue, { currentTime: 61.50 });
assert.ok(activeWord2.includes("tok-karaoke-active"), "Second word active time should have tok-karaoke-active");

// Test: Sub-tokens decomposed by Sudachi all receive parent word timing
const subTokenCue = {
  source: "乗せてないんですか？",
  tokens: [
    { surface: "乗せ", reading: "のせ", lemma: "乗せる", pos: "動詞" },
    { surface: "て", reading: "て", lemma: "て", pos: "助詞" },
    { surface: "ないん", reading: "ないん", lemma: "ない", pos: "助動詞" },
    { surface: "です", reading: "です", lemma: "です", pos: "助動詞" },
    { surface: "か", reading: "か", lemma: "か", pos: "助詞" },
    { surface: "？", reading: "", lemma: "？", pos: "補助記号" },
  ],
  words: [
    { word: "乗せて", start: 60.12, end: 60.85 },
    { word: "ないん", start: 60.85, end: 61.30 },
    { word: "ですか", start: 61.30, end: 61.90 },
    { word: "？", start: 61.90, end: 62.45 },
  ]
};
const subHtml = Vocab.renderRubyHtml(subTokenCue, { currentTime: 60.50 });
assert.ok(subHtml.includes('data-start="60.12" data-end="60.85">乗せ'), "First sub-token gets word timing");
assert.ok(subHtml.includes('data-start="60.12" data-end="60.85">て</span>'), "Second sub-token gets word timing");
assert.ok(subHtml.includes('data-start="61.3" data-end="61.9">です</span>'), "Sub-token in ですか gets word timing");
assert.ok(subHtml.includes('data-start="61.3" data-end="61.9">か</span>'), "Sub-token か gets word timing");

console.log("All vocab_style active-cue JLPT, source fidelity, escaping, and fallback tests passed!");
