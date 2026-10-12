/** Actual localhost protocol/production cost math; not Gemini/billing evidence. */
const assert = require('node:assert/strict'), http = require('node:http');
const { createTrace } = require('../extension/shared/sentence_benchmark.js');
const actualFetch = global.fetch;
let invalid = false, hits = 0;
const usage = { promptTokenCount: 1000, cachedContentTokenCount: 200,
  candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150,
  toolUsePromptTokenCount: 0, secret: 'must-not-export' };
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', b => body += b); req.on('end', () => {
    hits++;
    const jobs = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
    const translations = jobs.map(j => ({ id: j.id, revision: invalid ? 'wrong' : j.revision, text: `${j.targetLanguage}: translated` }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translations }) }] } }], usageMetadata: usage }));
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  global.fetch = (_url, options) => actualFetch(`http://127.0.0.1:${server.address().port}`, options);
  const Gemini = require('../extension/shared/gemini_translate.js');
  const jobs = ['vi', 'en'].map(language => ({ id: 'cost-' + language, revision: '1', language,
    source: '秘密の台詞', context: 'secret-context', sourceKey: 'cost-fixture' }));
  const trace = createTrace({ traceId: 'cost' });
  const report = await Gemini.translateGroups(jobs, { apiKey: 'test-only-key' });
  assert.equal(report.completed, 2); assert.equal(hits, 1);
  for (const result of report.results) trace.request(result.request, 1);
  const attempt = report.results[0].request.attempts[0];
  assert.equal(attempt.status, 200);
  assert.deepEqual(attempt.usage, Object.fromEntries(Object.entries(usage).filter(([key]) => key !== 'secret')));
  assert.ok(Number.isFinite(attempt.startedAtMs));
  const cost = trace.snapshot().apiCostEstimate;
  assert.equal(cost.currency, 'USD'); assert.equal(cost.pricedAttempts, 1); assert.equal(cost.totalAttempts, 1);
  assert.ok(Math.abs(cost.amount - 0.0011775) < 1e-12); // 800*.75 + 200*.075 + 150*3.75 per million
  assert.equal(cost.status, 'ESTIMATE'); assert.equal(trace.snapshot().apiCost, null);
  const cached = await Gemini.translateGroups(jobs, { apiKey: 'test-only-key' });
  assert.equal(hits, 1); assert.ok(cached.results.every(r => !r.request));
  invalid = true;
  const rejected = await Gemini.translateGroups([{ ...jobs[0], sourceKey: 'invalid-cost' }], { apiKey: 'test-only-key' });
  assert.equal(rejected.failed, 1);
  assert.deepEqual(rejected.results[0].request.attempts[0].usage, attempt.usage);
  trace.request(rejected.results[0].request, 2);
  assert.equal(trace.snapshot().apiCostEstimate.pricedAttempts, 2);
  assert.ok(Math.abs(trace.snapshot().apiCostEstimate.amount - 0.002355) < 1e-12);
  assert.ok(!JSON.stringify(trace.snapshot()).includes('secret-context'));
  assert.ok(!JSON.stringify(trace.snapshot()).includes('test-only-key'));
  assert.ok(!JSON.stringify(trace.snapshot()).includes('must-not-export'));
  assert.ok(!JSON.stringify(trace.snapshot()).includes('秘密の台詞'));
  console.log('PASS: actual HTTP200 VI/EN batch dedup keeps thinking/cache usage; rejected translation retains usage; cache exports no historical request; list-price estimate is separate from unverified billing');
  for (const patch of [
    { model: 'unknown' }, { startedAtMs: Date.parse('2027-01-01') }, { status: 503, usage: undefined },
    { usage: { ...attempt.usage, totalTokenCount: 999 } },
    { usage: { ...attempt.usage, cachedContentTokenCount: 1001 } },
    { usage: { ...attempt.usage, thoughtsTokenCount: -1 } },
    { usage: { ...attempt.usage, toolUsePromptTokenCount: 1 } },
  ]) {
    const partial = createTrace();
    partial.request({ id: 'known', attempts: [attempt] }, 1);
    partial.request({ id: 'unknown', attempts: [{ ...attempt, ...patch }] }, 2);
    const estimate = partial.snapshot().apiCostEstimate;
    assert.equal(estimate.status, 'PARTIAL ESTIMATE'); assert.equal(estimate.pricedAttempts, 1);
    assert.equal(estimate.totalAttempts, 2); assert.equal(estimate.amount, cost.amount);
  }
  const inferred = createTrace();
  const withoutThoughts = { ...attempt.usage }; delete withoutThoughts.thoughtsTokenCount;
  inferred.request({ id: 'inferred', attempts: [{ ...attempt, usage: withoutThoughts }] }, 1);
  assert.equal(inferred.snapshot().apiCostEstimate.amount, cost.amount);
  const empty = createTrace().snapshot().apiCostEstimate;
  assert.equal(empty.amount, null); assert.equal(empty.status, 'NOT VERIFIED');
  console.log('PASS: missing/expired/unknown/invalid usage never becomes zero-cost success; totals include thinking; incomplete trace estimates are explicitly partial');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = actualFetch; server.close();
});
