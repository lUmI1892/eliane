const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const source = fs.readFileSync(path.join(root, 'inventario-elianne.html'), 'utf8');
const oldAddon = source.slice(source.indexOf('<!-- SALON-V2-START -->'), source.indexOf('<!-- SALON-V2-END -->') + '<!-- SALON-V2-END -->'.length);
const pdf = fs.readFileSync(path.join(root, 'reports.js'), 'utf8');
if (!pdf || !oldAddon || !source.includes('/* ELIANNE-CORE */')) throw new Error('Missing source markers');
const salon = fs.readFileSync(path.join(root, 'salon.js'), 'utf8').replace('/* REPORT-PDF */', () => pdf).replace('/* RENTALS-UI */',()=>fs.readFileSync(path.join(root,'rentals-ui.js'),'utf8')).replace('/* EVENT-DETAIL */',()=>fs.readFileSync(path.join(root,'event-detail.js'),'utf8')).replace('/* CATALOG-UI */',()=>fs.readFileSync(path.join(root,'catalog-ui.js'),'utf8')).replace('/* CATEGORIES-UI */',()=>fs.readFileSync(path.join(root,'categories-ui.js'),'utf8')).replace('/* FINANCE-UI */',()=>fs.readFileSync(path.join(root,'finance-ui.js'),'utf8'));
const core = fs.readFileSync(path.join(root, 'storage.js'), 'utf8')+'\n'+fs.readFileSync(path.join(root, 'core.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'salon.css'), 'utf8');
const assembled = source.replace('/* ELIANNE-CORE */', () => core).replace(oldAddon, () => `<style>${css}</style>\n<script>${salon}</script>`);
let scriptIndex=0;
const output=assembled.replace(/<script>([\s\S]*?)<\/script>/g,(tag,body)=>{
  if(scriptIndex++===0)return tag;
  return `<script>(async()=>{await window.Elianne.ready;\n${body}\n})().catch(error=>window.Elianne.notify(error.message,true));</script>`;
});
for (const match of output.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1]);
fs.writeFileSync(path.join(root, 'inventario-elianne.verificado.html'), output, 'utf8');
console.log('Build OK:', Buffer.byteLength(output), 'bytes');
