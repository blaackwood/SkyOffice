const fs=require('fs'),ts=require('typescript'),vm=require('vm');
const {createCanvas,loadImage}=require('C:/Users/bwd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const manifest=JSON.parse(fs.readFileSync('client/src/data/atelier-avatar.json'));
const source=fs.readFileSync('client/src/services/AtelierAvatar.ts','utf8').replace('import.meta.env.BASE_URL',"'/'");
function renderer(code){const exports={};vm.runInNewContext(ts.transpile(code,{module:ts.ModuleKind.CommonJS}),{exports,require:p=>p.includes('atelier-avatar.json')?{default:manifest}:{normalizeAvatarParts:p=>p},document:{createElement:()=>createCanvas(64,96)},Map,Promise,Math});return exports.drawAvatarFrame;}
const after=renderer(source);
const start=source.indexOf("    if (slot === 'skin' && loaded.parts.jacket &&");
const end=source.indexOf('    ctx.drawImage(image, (frame % 8)',start);
const before=renderer(source.slice(0,start)+source.slice(end));
(async()=>{
const parts={skin:'skin_02',hair:'hair_01',top:'top_01',jacket:'jacket_01',bottom:'pants_01',shoes:'shoes_01'};
const out=createCanvas(640,460),ctx=out.getContext('2d');ctx.fillStyle='#303639';ctx.fillRect(0,0,640,460);
for(const [d,direction] of ['down','up','left','right'].entries()){
const layers=new Map();
for(const [slot,id] of Object.entries(parts)){
 const image=await loadImage(`client/public/assets/atelier-avatar/sheets/${direction}/${slot==='bottom'?'pants':slot}/${id}.png`);
 const sheet=createCanvas(544,300),c=sheet.getContext('2d');
 for(let i=0;i<24;i++)c.drawImage(image,i%8*128,Math.floor(i/8)*192,128,192,i%8*68+2,Math.floor(i/8)*100+2,64,96);
 layers.set(id+':'+direction,sheet);
}
for(const [r,draw] of [before,after].entries()){ctx.save();ctx.translate(d*160+16,r*220+20);draw(ctx,{parts,layers},direction,0,128);ctx.restore();}
}
ctx.fillStyle='white';ctx.font='14px sans-serif';ctx.fillText('Antes',8,16);ctx.fillText('Depois',8,236);
fs.writeFileSync('.avatar-review/hands-comparison.png',out.toBuffer('image/png'));
})();

