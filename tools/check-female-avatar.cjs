const fs=require('fs'),ts=require('typescript'),vm=require('vm');
const {createCanvas,loadImage}=require(process.env.CANVAS_MODULE||'C:/Users/bwd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const manifest=require('../client/src/data/atelier-avatar.json');
const source=fs.readFileSync('client/src/services/AtelierAvatar.ts','utf8').replace('import.meta.env.BASE_URL',"'/'");
const api={};vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}),{exports:api,require:p=>p.includes('atelier-avatar.json')?{default:manifest}:{normalizeAvatarParts:p=>p},document:{createElement:()=>createCanvas(64,96)},Map,WeakMap,Promise,Math});
(async()=>{const out=createCanvas(1024,768),ctx=out.getContext('2d');ctx.fillStyle='#303639';ctx.fillRect(0,0,out.width,out.height);
const configs=[{skin:'skin_female_02',hair:'hair_06',top:'top_04',jacket:''},{skin:'skin_female_05',hair:'hair_09',top:'top_12',jacket:'jacket_04'},{skin:'skin_female_02',hair:'hair_12',top:'top_01',jacket:''}];
for(let r=0;r<configs.length;r++){const parts={...configs[r],bottom:'pants_01',shoes:'shoes_01',hat:'',glasses:''};const layers=new Map();for(const direction of ['down','up','left','right'])for(const [slot,id]of Object.entries(parts)){if(!id)continue;const image=await loadImage(`client/public/assets/atelier-avatar/sheets/${direction}/${slot==='bottom'?'pants':slot}/${id}.png`);const sheet=createCanvas(544,300),c=sheet.getContext('2d');for(let i=0;i<24;i++)c.drawImage(image,i%8*128,Math.floor(i/8)*192,128,192,i%8*68+2,Math.floor(i/8)*100+2,64,96);layers.set(id+':'+direction,sheet)}
for(let col=0;col<8;col++){const direction=['down','up','left','right'][col%4];ctx.save();ctx.translate(col*128,r*256+24);if(col<4)api.drawAvatarFrame(ctx,{parts,layers},direction,0,128);else api.drawSeatedAvatar(ctx,{parts,layers},direction,1,128);ctx.restore();}
}fs.writeFileSync('.avatar-review/female-validation.png',out.toBuffer('image/png'));})().catch(e=>{console.error(e);process.exitCode=1});

