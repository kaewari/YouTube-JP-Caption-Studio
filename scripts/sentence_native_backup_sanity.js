/** Validate delivered native backup bytes; UI actions and quality gates stay separate. */
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Groups=require('../extension/shared/sentence_groups.js');
const [beforePath,afterPath]=process.argv.slice(2);
assert.ok(beforePath&&afterPath,'Supply original and updated native JSON backup paths');
const before=JSON.parse(fs.readFileSync(beforePath,'utf8')),bytes=fs.readFileSync(afterPath),after=JSON.parse(bytes);
assert.equal(after.format,'caption-studio-sentence-backup');assert.equal(after.version,1);
assert.equal(after.videoId,before.videoId);assert.equal(after.sourceKey,before.sourceKey);
assert.equal(new Set(after.cues.map(c=>c.id)).size,after.cues.length);
assert.ok(after.cues.every(c=>typeof c.id==='string'&&Number.isFinite(c.start_media_time)&&c.end_media_time>c.start_media_time));
for(const cue of after.cues) if(cue.tokens?.length) assert.equal(cue.tokens.map(t=>t.surface).join(''),cue.source);
const contract=c=>[c.source,c.start_media_time,c.end_media_time,c.text_source??null,c.mt_locked??null];
const rows=d=>d.cues.map(contract).map(JSON.stringify).sort();
assert.deepEqual(rows(after),rows(before),'Original source/time/ownership/lock row contracts must survive reload');
assert.deepEqual(after.transcriptMeta,before.transcriptMeta);assert.deepEqual(after.enhancement.rawTrack,before.enhancement.rawTrack);
assert.deepEqual(after.savedSentences,before.savedSentences);
const protectedRows=d=>d.cues.filter(Groups.isProtected).map(c=>JSON.stringify([contract(c),c.en,c.vi,c.translation_source])).sort();
assert.deepEqual(protectedRows(after),protectedRows(before),'Protected translations must survive reload');
const projection=Groups.buildSentenceGroups(after.cues,{sourceKey:after.sourceKey});
const allMt=d=>d.cues.map(c=>JSON.stringify([contract(c),c.en,c.vi,c.translation_source])).sort();
console.log(JSON.stringify({bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),cues:after.cues.length,
  uniqueIds:new Set(after.cues.map(c=>c.id)).size,groups:projection.groups.length,
  rawTrackCues:after.enhancement.rawTrack?.cues?.length??0,sourceCues:after.enhancement.sourceCues.length,
  translatedGroups:Object.keys(after.enhancement.translations).length,tokenGroups:Object.keys(after.enhancement.tokens).length,
  protectedCueCount:after.cues.filter(Groups.isProtected).length,
  automaticTranslationsIdentical:JSON.stringify(allMt(after))===JSON.stringify(allMt(before))}));
console.log('PASS: delivered native backup IDs/clocks/source/locks/raw track/saved snapshots and protected MT; production projection accepts file');
