/**
 * Runtime checks for the shared HTML entity decoder.
 *
 * timedtext_parse.js and dfxp_parser.js used to carry two hand-written
 * decoders that ran "&amp;" first and then decoded the numeric entity it
 * produced ("&amp;#39;" became "'"). Both modules now share one single-pass
 * decoder: an escaped entity stays literal.
 */
const assert = require("node:assert/strict");

const { decodeEntities } = require("./timedtext_parse.js");
const { decodeXmlEntities, parseDfxp } = require("./dfxp_parser.js");

// 1. One pass only — an escaped entity must not be decoded twice.
assert.equal(decodeEntities("&amp;#39;"), "&#39;", "an escaped numeric entity must stay literal");
assert.equal(decodeEntities("&amp;amp;"), "&amp;", "a doubly escaped entity must decode exactly once");
assert.equal(decodeEntities("&amp;lt;"), "&lt;", "an escaped tag must not become a tag");
assert.equal(decodeEntities("&amp;nbsp;"), "&nbsp;", "an escaped space must stay literal");

// 2. Plain entities still decode.
assert.equal(decodeEntities("&amp;"), "&");
assert.equal(decodeEntities("&lt;"), "<");
assert.equal(decodeEntities("&gt;"), ">");
assert.equal(decodeEntities("&quot;"), '"');
assert.equal(decodeEntities("&apos;"), "'");
assert.equal(decodeEntities("&#39;"), "'");
assert.equal(decodeEntities("&#x27;"), "'");
assert.equal(decodeEntities("&nbsp;"), " ");
assert.equal(decodeEntities("Tom &amp; Jerry"), "Tom & Jerry");
assert.equal(decodeEntities("&#65;&#66;"), "AB");

// 3. Unknown entities and malformed input stay untouched.
assert.equal(decodeEntities("&copy;"), "&copy;", "an unknown entity must not be swallowed");
assert.equal(decodeEntities("a & b"), "a & b");
assert.equal(decodeEntities("&amp"), "&amp", "an entity without a semicolon must stay literal");
assert.equal(decodeEntities(""), "");
assert.equal(decodeEntities(null), "");

// 4. Code points outside the BMP must survive (String.fromCodePoint, not fromCharCode).
assert.equal(decodeEntities("&#x1F600;"), "\u{1F600}", "astral code points must decode as one character");

// 5. The DFXP parser uses the very same decoder — same output for the same input.
const samples = [
  "&amp;#39;", "&amp;amp;", "&lt;b&gt;", "&#39;", "&#x27;", "&nbsp;",
  "&copy;", "a &amp; b", "&amp;quot;",
];
for (const sample of samples) {
  assert.equal(
    decodeXmlEntities(sample),
    decodeEntities(sample),
    `dfxp_parser must decode "${sample}" exactly like timedtext_parse`
  );
}
assert.equal(decodeXmlEntities(""), "", "an empty string stays empty");
assert.equal(decodeXmlEntities(null), "", "a null value stays empty");

// 6. End to end: a DFXP caption keeps the escaped entity literal.
const dfxp = `
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000">
  <body><div>
    <p begin="00:00:01.000" end="00:00:03.000">It&amp;#39;s here</p>
    <p begin="00:00:04.000" end="00:00:06.000">A &amp; B</p>
  </div></body>
</tt>
`;
const cues = parseDfxp(dfxp);
assert.equal(cues.length, 2, "both DFXP paragraphs must parse");
assert.equal(cues[0].text, "It&#39;s here", "an escaped entity must stay literal in a DFXP cue");
assert.equal(cues[1].text, "A & B", "a plain entity must decode in a DFXP cue");

// 7. The same holds for the timedtext XML parser (it uses the shared decoder).
const xml = `<transcript><text start="0.000" dur="2.000">It&amp;#39;s here</text></transcript>`;
const { parseTimedtextXml } = require("./timedtext_parse.js");
const xmlCues = parseTimedtextXml(xml);
assert.equal(xmlCues.length, 1);
assert.equal(xmlCues[0].text, "It&#39;s here", "an escaped entity must stay literal in a timedtext cue");

console.log("All HTML entity tests passed!");
