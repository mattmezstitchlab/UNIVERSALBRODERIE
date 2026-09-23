import { BASE_PALETTE, MAX_GRID_AXIS } from './project.mjs';

const MAX_FILE = 20 * 1024 * 1024;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const dist = (a,b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;

function nearest(pixel, palette) {
  let best = palette[0], score = Infinity;
  for (const thread of palette) {
    const d = dist(pixel, rgb(thread.color));
    if (d < score) { score = d; best = thread; }
  }
  return best;
}

function fitted(w, h, requestedWidth = null) {
  const max = MAX_GRID_AXIS;
  if (Number.isFinite(requestedWidth) && requestedWidth > 0) {
    const width = Math.min(max, Math.max(1, Math.round(requestedWidth)));
    const height = Math.min(max, Math.max(1, Math.round(width * h / w)));
    return { width, height };
  }
  const scale = Math.min(max / w, max / h, 1);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
    img.src = url;
  });
}

function projectFromImage(image, options) {
  const size = fitted(image.naturalWidth || image.width, image.naturalHeight || image.height, options.width);
  const requestedColors = Number(options.maxColors) || 36;
  const count = clamp(requestedColors, 1, BASE_PALETTE.length);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,size.width,size.height);
  const ratio = image.width / image.height, target = size.width / size.height;
  let sw=image.width, sh=image.height, sx=0, sy=0;
  if (ratio > target) { sw=image.height*target; sx=(image.width-sw)/2; }
  if (ratio < target) { sh=image.width/target; sy=(image.height-sh)/2; }
  ctx.drawImage(image,sx,sy,sw,sh,0,0,size.width,size.height);
  const data = ctx.getImageData(0,0,size.width,size.height).data;
  const frequency = new Map();
  for (let i=0;i<data.length;i+=4) {
    if (options.transparent === "empty" && data[i+3] < 40) continue;
    const q = [Math.round(data[i]/16)*16, Math.round(data[i+1]/16)*16, Math.round(data[i+2]/16)*16].join(",");
    frequency.set(q, (frequency.get(q) || 0) + 1);
  }
  const candidates = Array.from(frequency.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0, Math.min(256, frequency.size))
    .map(([key])=>key.split(",").map(Number));
  // Rapprochement contre tout le catalogue DMC, puis sélection des fils réellement
  // présents dans l'image. Cela évite qu'une petite palette prototype domine le résultat.
  const usage = new Map();
  for (const pixel of candidates) {
    const t = nearest(pixel, BASE_PALETTE);
    usage.set(t.threadId, (usage.get(t.threadId) || 0) + 1);
  }
  const paletteScores = Array.from(usage.keys())
    .map(threadId => ({ thread: BASE_PALETTE.find(t => t.threadId === threadId), score: usage.get(threadId) }))
    .filter(x => x.thread)
    .sort((a,b) => b.score - a.score);
  const palette = paletteScores.slice(0,count).map(({thread})=>({...thread}));
  const grid = Array.from({length:size.height}, () => Array(size.width).fill(null));
  const counts = {};
  for (const t of palette) counts[t.threadId] = 0;
  for (let y=0;y<size.height;y++) for (let x=0;x<size.width;x++) {
    const i=(y*size.width+x)*4;
    if (options.transparent === "empty" && data[i+3] < 40) continue;
    const t=nearest([data[i],data[i+1],data[i+2]],palette);
    grid[y][x]={threadId:t.threadId,stitchType:"cross"};
    counts[t.threadId]++;
  }
  return {
    version:1,
    id: globalThis.crypto?.randomUUID?.() || "maya-"+Date.now(),
    name: (options.name || "MAYA — image").trim() || "MAYA — image",
    template:null,widthStitches:size.width,heightStitches:size.height,
    fabric:{type:"Aïda",stitchesPerCm:5.5,marginsCm:{top:5,bottom:5,left:5,right:5}},
    palette,grid,
    extensions:{maya:{sourceFileName:options.fileName,sourceType:"image",
      algorithm:"RGB nearest-colour mapping, local and deterministic",
      maxColors:count,requestedWidth:size.width,countsByThread:counts,paletteStatus:"Catalogue DMC local complet utilisé pour le rapprochement ; correspondances physiques À CONFIRMER",
      createdAt:new Date().toISOString()}}
  };
}

const css = ".maya-panel{position:fixed;inset:0;z-index:1000;background:#1119;display:grid;place-items:center;padding:18px}.maya-panel[hidden]{display:none}.maya-card{width:min(760px,100%);max-height:88vh;overflow:auto;background:#fffefa;border:1px solid #e2e2da;border-radius:18px;padding:24px;box-shadow:0 30px 100px #0005;font-family:system-ui,-apple-system,sans-serif;color:#202a22}.maya-head{display:flex;justify-content:space-between;gap:16px}.maya-kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#657366}.maya-title{font-size:30px;letter-spacing:-.04em;margin:5px 0}.maya-sub{font-size:13px;color:#6c786e;line-height:1.45}.maya-close{border:0;border-radius:50%;width:34px;height:34px;cursor:pointer}.maya-drop{display:block;margin-top:20px;padding:28px;border:1px dashed #aab5aa;border-radius:14px;text-align:center;background:#f6f7f2;cursor:pointer}.maya-drop strong,.maya-drop span{display:block}.maya-drop span{font-size:11px;color:#718073;margin-top:5px}.maya-preview{display:grid;grid-template-columns:180px 1fr;gap:18px;margin-top:16px}.maya-preview[hidden]{display:none}.maya-preview canvas{width:180px;height:180px;object-fit:contain;background:#eee;border-radius:10px}.maya-fields{display:grid;gap:10px}.maya-fields label{font-size:11px;color:#687568}.maya-fields input,.maya-fields select{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #dfe2d9;border-radius:8px;background:#fff}.maya-meta,.maya-note{font-size:11px;color:#718073;line-height:1.5}.maya-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.maya-actions button{padding:10px 14px;border:1px solid #dfe2d9;border-radius:9px;cursor:pointer}.maya-actions .primary{background:#2f563b;color:white;border-color:#2f563b}@media(max-width:620px){.maya-preview{grid-template-columns:1fr}.maya-preview canvas{width:100%;height:auto;aspect-ratio:1}}";

export function mountMayaImport() {
  if (document.getElementById("mayaPanel")) return;
  const style=document.createElement("style"); style.textContent=css; document.head.appendChild(style);
  const panel=document.createElement("div"); panel.id="mayaPanel"; panel.className="maya-panel"; panel.hidden=true;
  panel.innerHTML='<section class="maya-card" role="dialog" aria-modal="true"><div class="maya-head"><div><div class="maya-kicker">MAYA · Atelier universel de broderie</div><h2 class="maya-title">Image → patron</h2><div class="maya-sub">Transformez une image en grille éditable. Le calcul reste local et déterministe.</div></div><button class="maya-close" id="mayaClose">×</button></div><label class="maya-drop" id="mayaDrop" for="mayaFile"><strong>Déposer une image ici</strong><span>JPG, JPEG, PNG ou WEBP · maximum 20 Mo</span></label><input id="mayaFile" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden><div class="maya-preview" id="mayaPreview" hidden><canvas id="mayaCanvas" width="180" height="180"></canvas><div class="maya-fields"><label>Nom du patron<input id="mayaName" maxlength="100" value="MAYA — image"></label><label>Largeur du patron<select id="mayaWidth"><option value="24">24 points</option><option value="36" selected>36 points</option><option value="48">48 points</option><option value="72">72 points</option><option value="100">100 points</option><option value="150">150 points</option><option value="200">200 points</option></select></label><label>Couleurs maximum<select id="mayaColors"><option value="24" >24</option><option value="36" selected>36</option><option value="48" >48</option><option value="72" >72</option><option value="100" >100</option><option value="150" >150</option><option value="200" >200</option></select></label><label>Transparence<select id="mayaTransparent"><option value="empty">Transparent = vide</option><option value="white">Transparent = blanc</option></select></label><div class="maya-meta" id="mayaMeta"></div></div></div><div class="maya-actions"><button id="mayaCancel">Annuler</button><button id="mayaCreate" class="primary" disabled>Créer le patron</button></div><p class="maya-note">Les références DMC historiques restent « À CONFIRMER ». MAYA ne prétend pas vérifier une correspondance fabricant.</p></section>';
  document.body.appendChild(panel);
  const fileInput=panel.querySelector("#mayaFile"), drop=panel.querySelector("#mayaDrop"), preview=panel.querySelector("#mayaPreview");
  const canvas=panel.querySelector("#mayaCanvas"), meta=panel.querySelector("#mayaMeta"), create=panel.querySelector("#mayaCreate");
  let file=null,image=null;
  const close=()=>{panel.hidden=true;file=null;image=null;create.disabled=true;preview.hidden=true;};
  const redraw=()=>{if(!image)return;const s=fitted(image.width,image.height,Number(panel.querySelector("#mayaWidth").value)),ctx=canvas.getContext("2d");ctx.clearRect(0,0,180,180);const r=Math.min(180/image.width,180/image.height),w=image.width*r,h=image.height*r;ctx.drawImage(image,(180-w)/2,(180-h)/2,w,h);meta.textContent=image.width+" × "+image.height+" px → "+s.width+" × "+s.height+" points · "+panel.querySelector("#mayaColors").value+" couleurs max";};
  const choose=async picked=>{if(!picked)return;if(picked.size>MAX_FILE){alert("Image trop volumineuse (maximum 20 Mo).");return;}try{image=await readImage(picked);file=picked;preview.hidden=false;create.disabled=false;redraw();}catch(e){alert(e.message);}};
  fileInput.addEventListener("change",e=>choose(e.target.files?.[0]));
  for(const n of ["dragenter","dragover"])drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add("drag");});
  for(const n of ["dragleave","drop"])drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove("drag");});
  drop.addEventListener("drop",e=>choose(e.dataTransfer?.files?.[0]));
  panel.querySelector("#mayaColors").addEventListener("change",redraw);
  panel.querySelector("#mayaWidth").addEventListener("change",redraw);
  panel.querySelector("#mayaClose").addEventListener("click",close);
  panel.querySelector("#mayaCancel").addEventListener("click",close);
  panel.addEventListener("click",e=>{if(e.target===panel)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)close();});
  create.addEventListener("click",async()=>{
    if(!file||!image)return;
    create.disabled=true;
    try {
      const project=projectFromImage(image,{name:panel.querySelector("#mayaName").value,fileName:file.name,maxColors:panel.querySelector("#mayaColors").value,width:Number(panel.querySelector("#mayaWidth").value),transparent:panel.querySelector("#mayaTransparent").value});
      window.dispatchEvent(new CustomEvent("maya:import-project",{detail:{project}}));
      close();
    } catch(e) { alert("Création refusée : "+e.message); create.disabled=false; }
  });
  return {open:()=>{panel.hidden=false;}};
}

export { projectFromImage };
