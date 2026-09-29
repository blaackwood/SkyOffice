// Bake the generated female art into the existing animation grid.
// Keep the original animated limbs as rig attachments so cuffs, shoes and seats stay aligned.
const fs=require('fs'),path=require('path');
const {createCanvas,loadImage}=require(process.env.CANVAS_MODULE||'C:/Users/bwd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const root='client/public/assets/atelier-avatar';
const dirs=['down','up','left','right'];
function bounds(data,w,h,x0=0,x1=w,y0=0,y1=h){let l=w,t=h,r=-1,b=-1;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*w+x)*4+3]>160){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}return {x:l,y:t,w:r-l+1,h:b-t+1};}
(async()=>{
const atlas=await loadImage(root+'/female-source/base-four-directions.png');const ac=createCanvas(atlas.width,atlas.height),ax=ac.getContext('2d');ax.drawImage(atlas,0,0);const ap=ax.getImageData(0,0,atlas.width,atlas.height).data;
const sources=dirs.map((d,i)=>bounds(ap,atlas.width,atlas.height,Math.floor(i*atlas.width/4),Math.floor((i+1)*atlas.width/4),0,335));
const manifest=JSON.parse(fs.readFileSync('client/src/data/atelier-avatar.json'));
for(let tone=1;tone<=6;tone++){
 const oldId='skin_'+String(tone).padStart(2,'0'),id='skin_female_'+String(tone).padStart(2,'0');
 const originalItem=manifest.items.find(i=>i.id===oldId),item=JSON.parse(JSON.stringify(originalItem));item.id=id;item.label=originalItem.label;item.body='female';
 for(let di=0;di<4;di++){
  const d=dirs[di],original=await loadImage(`${root}/sheets/${d}/skin/${oldId}.png`);
  const out=createCanvas(original.width,original.height),ctx=out.getContext('2d');ctx.drawImage(original,0,0);
  const ref=createCanvas(128,192),rc=ref.getContext('2d');rc.drawImage(original,0,0,128,192,0,0,128,192);
  const oldData=rc.getImageData(0,0,128,192).data;
  const first=bounds(oldData,128,192,0,128,0,74);
  // Match the forehead tone while retaining the generated face shading and eye whites.
  const sample=rc.getImageData(64,30,1,1).data;
  const source=sources[di],head=createCanvas(source.w,source.h),hc=head.getContext('2d');
  hc.drawImage(atlas,source.x,source.y,source.w,source.h,0,0,source.w,source.h);
  const pixels=hc.getImageData(0,0,head.width,head.height);
  for(let p=0;p<pixels.data.length;p+=4){const r=pixels.data[p],g=pixels.data[p+1],b=pixels.data[p+2];if(r>g*1.12&&g>b*1.12&&r>70){const ratios=[sample[0]/246,sample[1]/175,sample[2]/123];for(let k=0;k<3;k++)pixels.data[p+k]=Math.min(255,pixels.data[p+k]*ratios[k]);}}
  hc.putImageData(pixels,0,0);
  for(let frame=0;frame<48;frame++){
   const fx=frame%8*128,fy=Math.floor(frame/8)*192;
   const fd=ctx.getImageData(fx,fy,128,192).data;
   const bb=bounds(fd,128,192,0,128,0,74);
   // Retain the original head position in each pose. Replace face AND neck,
   // leaving attachment landmarks unchanged for all existing hair/accessories.
   ctx.clearRect(fx,fy,128,74);
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(head,0,0,head.width,head.height,fx+bb.x,fy+bb.y,bb.w,74-bb.y);
   // New base torso from the same generated artwork, under modular garments.
   // Animated arms and legs remain the rig's attachments; the torso is centered on its head.
   const shift=(bb.x+bb.w/2)-(first.x+first.w/2);
   const center=[258,716,1180,1650][di];
   ctx.clearRect(fx+49+shift,fy+75,30,31);
   ctx.drawImage(atlas,center-50,338,100,164,fx+49+shift,fy+75,30,31);
   const tx=Math.round(fx+49+shift),ty=fy+75,torso=ctx.getImageData(tx,ty,30,31);
   for(let p=0;p<torso.data.length;p+=4){const r=torso.data[p],g=torso.data[p+1],b=torso.data[p+2];if(r>g*1.12&&g>b*1.12&&r>70){for(let k=0;k<3;k++)torso.data[p+k]=Math.min(255,torso.data[p+k]*[sample[0]/246,sample[1]/175,sample[2]/123][k]);}}ctx.putImageData(torso,tx,ty);
  }
  const sheetPath=`sheets/${d}/skin/${id}.png`,itemPath=`items/${d}/skin/${id}.png`;
  fs.mkdirSync(path.dirname(root+'/'+itemPath),{recursive:true});fs.writeFileSync(root+'/'+sheetPath,out.toBuffer('image/png'));
  const thumb=createCanvas(128,192);thumb.getContext('2d').drawImage(out,0,0,128,192,0,0,128,192);fs.writeFileSync(root+'/'+itemPath,thumb.toBuffer('image/png'));
  item.directions[d]={...item.directions[d],sheet:sheetPath,item:itemPath,aligned:itemPath};
 }
 manifest.items=manifest.items.filter(i=>i.id!==id);manifest.items.push(item);
 if(!manifest.slots.skin.includes(id))manifest.slots.skin.push(id);
}
for(const target of ['client/src/data/atelier-avatar.json',root+'/manifest.json'])fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
console.log('Baked 6 female bases × 4 directions × 48 frames.');
})().catch(e=>{console.error(e);process.exitCode=1});


