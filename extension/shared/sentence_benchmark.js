/** Local bounded runtime observations. No captions, keys or network transmission. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HardsubSentenceBenchmark = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Paid standard text rates verified 2026-10-10 JST; expire rather than assume future pricing.
  // https://ai.google.dev/gemini-api/docs/pricing (thinking is billed as output).
  const priceEvidence = { source: "https://ai.google.dev/gemini-api/docs/pricing", asOf: "2026-10-10 JST", validUntil: "2026-11-10" };
  function estimateAttemptCost(attempt) {
    const rates = { "gemini-3.8-flash": [.75, .075, 3.75], "gemini-2.5-flash": [.30, .03, 2.50] }[attempt.model];
    const usage = attempt.usage, date = attempt.startedAtMs;
    if (!rates || attempt.status !== 200 || attempt.usageInvalid || !Number.isFinite(date) ||
        date < Date.parse("2026-10-09") || date >= Date.parse(priceEvidence.validUntil) || !usage ||
        Object.values(usage).some(value => !Number.isSafeInteger(value) || value < 0)) return null;
    const prompt = usage.promptTokenCount, total = usage.totalTokenCount;
    const cached = usage.cachedContentTokenCount || 0, candidate = usage.candidatesTokenCount;
    if (![prompt, total, candidate].every(Number.isSafeInteger) || total < prompt || cached > prompt ||
        (usage.toolUsePromptTokenCount || 0) !== 0 || total - prompt < candidate ||
        (usage.thoughtsTokenCount != null && total - prompt !== candidate + usage.thoughtsTokenCount)) return null;
    return ((prompt - cached) * rates[0] + cached * rates[1] + (total - prompt) * rates[2]) / 1e6;
  }
  function createTrace({ traceId, openedAt = 0, warmupMs = 5000 } = {}) {
    const events = [], readyAt = new Map(), seen = new Set(), requests = new Map(), groupRefs = new Map();
    let groupIdentityBytes = 0;
    let previous = null, pass = 0, loadedAt = null, firstPaint = null, dropped = 0;
    const emit = (type, data, now) => {
      if (events.length >= 10000) { dropped++; return; }
      events.push({ type, atMs: now, ...data });
    };
    function groupRef(group) {
      if (typeof group?.id !== "string" || typeof group.revision !== "string") return null;
      // IDs/revisions contain dialogue. Keep bounded identities private; export only local ordinals.
      const key = JSON.stringify([group.id, group.revision]);
      if (groupRefs.has(key)) return groupRefs.get(key);
      if (groupRefs.size >= 10000 || groupIdentityBytes + key.length * 2 > 4 * 1024 * 1024) { dropped++; return null; }
      const entry = { ref: groupRefs.size + 1, prepared: false };
      groupRefs.set(key, entry); groupIdentityBytes += key.length * 2;
      return entry;
    }
    function groupsPrepared(groups, now) {
      if (events.length >= 10000) { dropped++; return; }
      for (const group of groups) {
        const entry = groupRef(group);
        if (!entry || entry.prepared) continue;
        entry.prepared = true;
        emit("group_prepared", { groupRef: entry.ref, protected: !!group.protected,
          sourceCount: group.sourceRefs.length, startMediaTime: group.start, endMediaTime: group.end }, now);
      }
    }
    function translationsQueued(jobs, manual, mode, now) {
      if (events.length >= 10000) { dropped++; return; }
      for (const job of jobs) {
        const entry = groupRef(job);
        if (entry && ["vi", "en"].includes(job.language))
          emit("translation_queued", { groupRef: entry.ref, language: job.language, manual: !!manual,
            mode: ["original", "enhanced"].includes(mode) ? mode : null }, now);
      }
    }
    function translationResult(result, accepted, mode, now) {
      if (events.length >= 10000) { dropped++; return; }
      if (!["ready", "error", "cancelled"].includes(result.status) || !["vi", "en"].includes(result.language)) return;
      const entry = groupRef(result);
      if (!entry) return;
      const type = result.status === "cancelled" ? "translation_cancelled" :
        result.status === "error" ? "translation_error" : !accepted ? "translation_discarded" : "translation_ready";
      emit(type, { groupRef: entry.ref, language: result.language, status: result.status,
        mode: ["original", "enhanced"].includes(mode) ? mode : null,
        accepted: !!accepted, cached: result.cached === true,
        httpStatus: Number.isInteger(result.httpStatus) && result.httpStatus >= 0 && result.httpStatus <= 599 ? result.httpStatus : null }, now);
    }
    function resetPlayback(now, reason) { previous = null; pass++; emit("discontinuity", { reason }, now); }
    function prepared(units, now) {
      const activeKeys = new Set();
      for (const unit of units.slice(0, 20000)) {
        if (!unit.source) continue;
        for (const language of ["ja", "vi", "en"]) {
          const key = `${unit.id}:${language}`;
          activeKeys.add(key);
          const text = language === "ja" ? unit.source : String(unit[language] || "").trim();
          if (!text) { readyAt.delete(key); continue; }
          const signature = JSON.stringify([unit.source, text]);
          if (readyAt.get(key)?.signature !== signature) readyAt.set(key, { signature, at: now });
        }
      }
      for (const key of readyAt.keys()) if (!activeKeys.has(key)) readyAt.delete(key);
    }
    function sample({ time, rate, paused, seeking, hidden, mode, languages, units }, now) {
      if (events.length >= 10000) { dropped++; return; }
      if (![time, rate, now].every(Number.isFinite) || rate <= 0) return;
      prepared(units, now);
      if (paused || seeking || hidden) { previous = null; return; }
      const current = { time, rate, mode, now };
      if (previous) {
        const dt = now - previous.now, delta = time - previous.time;
        if (dt <= 0) return;
        // ponytail: samples over 500ms or discontinuous clocks are unobserved;
        // use frame tracing if tighter onset bounds are needed, never invent success.
        if (dt > 500 || delta < 0 || Math.abs(delta - dt / 1000 * rate) > 0.3 ||
            previous.rate !== rate || previous.mode !== mode) {
          resetPlayback(now, "clock/rate/mode/gap");
        } else {
          for (const unit of units) {
            const anchor = unit.start_media_time, key = `${pass}:${mode}:${unit.id}:${anchor}`;
            if (!unit.source || anchor <= previous.time || anchor > time || seen.has(key)) continue;
            seen.add(key);
            const readiness = {};
            for (const language of ["ja", ...languages]) {
              const at = readyAt.get(`${unit.id}:${language}`)?.at;
              readiness[language] = at == null || at > now ? "missing" : at <= previous.now ? "ready" : "within_sample";
            }
            emit("onset", { mediaTime: anchor, rate, mode, readiness,
              windowMs: [previous.now, now], phase: loadedAt != null && previous.now >= loadedAt + warmupMs ? "warm" : "cold" }, now);
          }
        }
      }
      previous = current;
    }
    function request(receipt, now) {
      if (!receipt?.id || requests.has(receipt.id)) return;
      if (requests.size >= 10000) { dropped++; return; }
      requests.set(receipt.id, receipt); emit("request", { receipt }, now);
    }
    function snapshot(context = {}) {
      const onsets = events.filter(e => e.type === "onset");
      const readiness = {};
      for (const mode of ["original", "enhanced"]) for (const phase of ["cold", "warm"]) {
        const rows = onsets.filter(e => e.mode === mode && e.phase === phase), languages = new Set(rows.flatMap(e => Object.keys(e.readiness)));
        for (const language of languages) {
          const values = rows.filter(e => Object.hasOwn(e.readiness, language));
          const ready = values.filter(e => e.readiness[language] === "ready").length;
          const uncertain = values.filter(e => e.readiness[language] === "within_sample").length;
          readiness[`${mode}:${phase}:${language}`] = { total: values.length, ready, uncertain,
            missing: values.length - ready - uncertain,
            lowerBound: ready / values.length, upperBound: (ready + uncertain) / values.length };
        }
      }
      const attempts = [...requests.values()].flatMap(r => r.attempts || []);
      const latency = attempts.map(a => a.elapsedMs).filter(Number.isFinite).sort((a,b) => a-b);
      const percentile = p => latency.length ? latency[Math.ceil(p * latency.length) - 1] : null;
      const costs = attempts.map(estimateAttemptCost).filter(value => value !== null);
      return { version: 1, traceId, context, openedAtMs: openedAt, warmupMs,
        timeToTrackLoadedMs: loadedAt == null ? null : loadedAt - openedAt,
        ttfvMs: firstPaint == null ? null : firstPaint - openedAt,
        definition: "Observed continuous foreground onset windows; readiness bounds use sampled state and include sample uncertainty. Clear/restore entirely between samples is unobserved, so bounds require no intervening state mutation and do not certify a release gate. Initial/seek/background/gap crossings are unobserved. Zero observations have no verified rate.",
        readiness, requestCount: attempts.length, requestLatencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
        requestDefinition: "HTTP attempts observed by this trace; receipt IDs deduplicate shared batches within the trace. Shared IDs may also occur in other traces. Cache hits contribute no historical request.",
        lifecycleDefinition: "group_prepared means a logical group revision was built, not NLP/translation or audio verification. translation_queued is content submission after target filtering, not worker admission/HTTP dispatch; repeated submissions can share an HTTP attempt or hit cache. translation_ready means a validated result accepted for the current projection/cue, not observed onset readiness or paint. Discarded results can have billable attempts. groupRef is a trace-local ordinal for an ID+revision (sentence in Enhanced, cue in Original); identity text, captions, context and errors are omitted. Identity text is capped at 4MiB and events/identities at 10000; truncation marks the trace unverified.",
        apiCost: null, apiCostStatus: "NOT VERIFIED: no account billing evidence", droppedEvents: dropped,
        apiCostEstimate: { currency: "USD", amount: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
          pricedAttempts: costs.length, totalAttempts: attempts.length,
          status: !costs.length ? "NOT VERIFIED" : costs.length === attempts.length ? "ESTIMATE" : "PARTIAL ESTIMATE",
          priceEvidence, definition: "Standard paid text list-price estimate for observed, priced attempts only; includes thinking and cached input. Not a bill: account tier, discounts, taxes and unobserved/unknown attempts are unverified. Shared receipts can appear in other traces; do not sum trace totals blindly." },
        status: onsets.length && !dropped ? "OBSERVED" : "NOT VERIFIED", events };
    }
    return { sample, prepared, request, resetPlayback, snapshot, groupsPrepared, translationsQueued, translationResult,
      trackLoaded(now) { if (loadedAt == null) loadedAt = now; emit("track_loaded", {}, now); },
      paint(now, rect) { if (firstPaint == null && rect.width > 0 && rect.height > 0) {
        firstPaint = now; emit("jp_paint", { rect }, now);
      } },
    };
  }
  return { createTrace };
});
