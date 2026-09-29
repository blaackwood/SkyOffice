const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const manifest=require('../client/src/data/atelier-avatar.json'),storage=new Map(),api={};
vm.runInNewContext(ts.transpile(fs.readFileSync('client/src/avatarConfig.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}),{exports:api,require:()=>({default:manifest}),localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
for(let tone=1;tone<=6;tone++)for(const prefix of ['skin_','skin_female_']){
 const skin=prefix+String(tone).padStart(2,'0'),parts={...api.DEFAULT_AVATAR_CHOICE.parts,skin,hair:'hair_09',top:'top_12',jacket:''};
 const choice={avatar:'atelier',tint:0xffffff,parts};
 assert.equal(api.normalizeAvatarChoice(choice).parts.skin,skin);
 api.saveAvatar('Avatar Test',choice);const restored=api.loadSavedAvatar('Avatar Test');assert.equal(JSON.stringify(restored.parts),JSON.stringify(api.normalizeAvatarParts(parts)));
 const item=manifest.items.find(i=>i.id===skin);for(const d of ['down','up','left','right']){const p='client/public/assets/atelier-avatar/'+item.directions[d].sheet;const bytes=fs.readFileSync(p);assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1152);}
}
assert.equal(api.normalizeAvatarParts({skin:'invalid'}).skin,'skin_02');
assert.equal(api.normalizeAvatarParts(undefined).skin,'skin_02');
console.log('PASS: 12 bases, 48 directional sheets, saved-choice round trip, legacy default and invalid-ID fallback.');
