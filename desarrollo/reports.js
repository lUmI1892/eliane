// The standalone app keeps its PDF writer local so reports also work offline.
function reportPdf(title, blocks, name, initialContext='') {
  const width=595,height=842,margin=36,bodyWidth=523,bottom=786;
  const ink=[0.09,0.14,0.17],muted=[0.34,0.40,0.44],accent=[0.04,0.42,0.39],pale=[0.93,0.96,0.96];
  const measure=document.createElement('canvas').getContext('2d');
  const clean=value=>String(value??'').replace(/[\u2010-\u2015]/g,'-').replace(/\u00a0/g,' ').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
  const hex=value=>'<'+Array.from(clean(value),ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'>';
  const textWidth=(value,size,bold=false)=>{measure.font=`${bold?'bold ':''}${size}px Arial`;return measure.measureText(value).width*1.06;};
  function wrap(value,available,size=10,bold=false){
    const result=[];
    for(const paragraph of clean(value).split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(line&&textWidth(line+' '+word,size,bold)<=available){line+=' '+word;continue;}
        if(line){result.push(line);line='';}
        let part='';
        for(const ch of word){if(part&&textWidth(part+ch,size,bold)>available){result.push(part);part='';}part+=ch;}
        line=part;
      }
      result.push(line);
    }
    return result;
  }
  const pages=[];let page,y,context=initialContext;
  const rgb=color=>color.join(' ');
  function text(value,x,top,size=10,bold=false,color=ink){page.push(`${rgb(color)} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${height-top-size} Tm ${hex(value)} Tj ET`);}
  function rect(x,top,w,h,color){page.push(`${rgb(color)} rg ${x} ${height-top-h} ${w} ${h} re f`);}
  function line(top){page.push(`0.82 0.87 0.88 RG 0.5 w ${margin} ${height-top} m ${width-margin} ${height-top} l S`);}
  function newPage(){
    page=[];pages.push(page);
    text('ELIANNE / ADMINISTRACION DE EVENTOS',margin,25,9,true,accent);
    const titles=wrap(title,bodyWidth,19,true);
    titles.forEach((value,i)=>text(value,margin,44+i*24,19,true));
    let top=48+titles.length*24;
    text('Emitido: '+new Date().toLocaleString('es-BO'),margin,top,8,false,muted);top+=18;
    if(context){wrap(context,bodyWidth,9,true).slice(0,2).forEach(value=>{text(value,margin,top,9,true);top+=13;});}
    line(top+3);y=top+17;
  }
  const ensure=space=>{if(y+space>bottom)newPage();};
  function paragraph(value,{bold=false,size=10,color=ink}={}){
    for(const valueLine of wrap(value,bodyWidth,size,bold)){ensure(size+7);text(valueLine,margin,y,size,bold,color);y+=size+5;}
    y+=7;
  }
  function table(block){
    const widths=block.widths,columns=block.columns,size=9,leading=13,pad=7;
    const headerLines=columns.map((col,i)=>wrap(col,widths[i]-pad*2,size,true));
    const headerHeight=Math.max(...headerLines.map(a=>a.length))*leading+pad*2;
    function header(){
      ensure(headerHeight+leading+pad*2);rect(margin,y,bodyWidth,headerHeight,accent);
      let x=margin;headerLines.forEach((lines,i)=>{lines.forEach((value,j)=>text(value,x+pad,y+pad+j*leading,size,true,[1,1,1]));x+=widths[i];});y+=headerHeight;
    }
    header();
    for(const [index,row] of block.rows.entries()){
      const cells=columns.map((col,i)=>wrap(row[i]??'',widths[i]-pad*2,size));
      const count=Math.max(...cells.map(a=>a.length));let offset=0;
      const rowHeight=count*leading+pad*2;
      if(y+rowHeight>bottom&&rowHeight<bottom-150-headerHeight){newPage();header();}
      while(offset<count){
        let room=Math.floor((bottom-y-pad*2)/leading);
        if(room<1){newPage();header();room=Math.floor((bottom-y-pad*2)/leading);}
        const take=Math.min(count-offset,room),h=take*leading+pad*2;
        if(index%2===0)rect(margin,y,bodyWidth,h,pale);
        let x=margin;
        cells.forEach((lines,i)=>{lines.slice(offset,offset+take).forEach((value,j)=>text(value,x+pad,y+pad+j*leading,size));x+=widths[i];});
        y+=h;line(y);offset+=take;
        if(offset<count){newPage();header();}
      }
    }
    y+=16;
  }
  newPage();
  for(const block of blocks){
    if(block.type==='page'){context=block.context||'';newPage();}
    if(block.type==='heading'){ensure(60);paragraph(block.text,{bold:true,size:13,color:accent});}
    if(block.type==='text')paragraph(block.text,block);
    if(block.type==='table')table(block);
    if(block.type==='signatures'){ensure(60);y+=24;line(y);text('Entrega: ____________________     Recibe: ____________________',margin,y+10,10);y+=35;}
  }
  pages.forEach((commands,index)=>{page=commands;line(802);text('Salon Elianne',margin,813,8,false,muted);text(`Pagina ${index+1} de ${pages.length}`,width-margin-95,813,8,false,muted);});
  const encoder=new TextEncoder(),objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const ids=[];let next=5;
  pages.forEach(commands=>{const stream=commands.join('\n'),contentId=next++,pageId=next++;objects[contentId]=`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;ids.push(pageId);});
  objects[2]=`<< /Type /Pages /Kids [${ids.map(id=>id+' 0 R').join(' ')}] /Count ${ids.length} >>`;
  const parts=[],offsets=[];let position=0;
  const add=value=>{const bytes=encoder.encode(value);parts.push(bytes);position+=bytes.length;};
  add('%PDF-1.4\n');
  for(let i=1;i<objects.length;i++){offsets[i]=position;add(`${i} 0 obj\n${objects[i]}\nendobj\n`);}
  const xref=position;add(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for(let i=1;i<objects.length;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const output=new Uint8Array(position);let offset=0;parts.forEach(bytes=>{output.set(bytes,offset);offset+=bytes.length;});
  download((name||'reporte-elianne')+'-'+today()+'.pdf',output,'application/pdf');
}
