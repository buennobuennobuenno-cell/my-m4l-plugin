const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {makeHost}=require('./host.cjs');

function panel(callback,bank=0){
  const events=[],drawn=[],hints=[];let redraws=0;
  const graphics={init(){},redraw(){redraws++;},set_source_rgba(){},rectangle(){},fill(){},
    select_font_face(){},set_font_size(){},move_to(){},show_text(s){drawn.push(s);}};
  const c={mgraphics:graphics,box:{rect:[0,0,118,112],message(...a){hints.push(a);}},
    outlet(...args){events.push(args);if(callback)callback(...args);}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/rm16_v3_limits.js'),'utf8'),c);
  c.bank(bank);redraws=0;
  return{c,events,drawn,hints,get redraws(){return redraws;}};
}

test('three narrow panels render all 48 rounded numbers while retaining exact precision',()=>{
  for(let bank=0;bank<3;bank++){
    const p=panel(undefined,bank);
    for(let j=0;j<24;j++)p.c.row(j+1,12.3456789+j,99.123456789);
    p.c.paint();assert.equal(p.drawn.length,16);assert.equal(p.events.length,0);
    for(let row=0;row<8;row++){
      const j=bank*8+row;
      assert.equal(p.c.values[j][0],12.3456789+j);assert.equal(p.c.values[j][1],99.123456789);
      assert.equal(p.drawn[2*row],String(Math.round(12.3456789+j)));
    }
  }
});

test('bank selection rejects invalid indices and only redraws on a bank change',()=>{
  const p=panel();
  for(const bank of [0,-1,3,0.5,NaN,Infinity])p.c.bank(bank);
  assert.equal(p.redraws,0);assert.equal(p.c.bankIndex,0);
  p.c.bank(1);assert.equal(p.redraws,1);assert.equal(p.c.bankIndex,1);
  p.c.bank(1);assert.equal(p.redraws,1);
});

test('unchanged bounds never request a redraw and bad rows are ignored',()=>{
  const p=panel();p.c.row(1,0,100);assert.equal(p.redraws,0);
  for(const number of [0,-1,25,1.5,NaN])p.c.row(number,20,80);
  p.c.row(1,NaN,80);assert.equal(p.redraws,0);
  p.c.row(1,20,80);assert.equal(p.redraws,1);
  p.c.row(1,20,80);assert.equal(p.redraws,1);
});

test('every visible min/max field resolves to the right row, column and keyboard request',()=>{
  for(let bank=0;bank<3;bank++){
    const p=panel(undefined,bank);
    for(let row=0;row<8;row++)for(let key=0;key<2;key++){
      const x=key?68:6,y=row*14+5;
      p.c.onclick(x,y);p.c.ondblclick(x,y);
      assert.deepEqual(p.events.at(-1),[0,'edit',bank*8+row+1,key?'hi':'lo']);
    }
    const before=p.events.length;
    for(const [x,y] of [[-1,1],[56,1],[61,1],[118,1],[6,-1],[6,112],[NaN,1]]){
      p.c.onclick(x,y);p.c.ondblclick(x,y);
    }
    assert.equal(p.events.length,before);
  }
});

test('dragging requests integer steps and clamps output without changing the stored value itself',()=>{
  const p=panel();p.c.row(1,12.3456789,100);
  p.c.onclick(6,12);p.c.ondrag(6,12,1);
  assert.equal(p.events.filter(a=>a[1]==='setting').length,0);
  p.c.ondrag(6,10,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',13]);
  assert.equal(p.c.values[0][0],12.3456789);
  p.c.ondrag(6,-1000,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',100]);
  p.c.ondrag(6,1000,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',0]);
  const count=p.events.length;p.c.ondrag(6,1000,0);p.c.ondrag(6,500,1);
  assert.equal(p.events.length,count);
});

test('all three panels receive controller state and edit their own eight mappings',()=>{
  const h=makeHost();
  // Start all at their script default: the controller must select each bank,
  // without relying on optional JSUI arguments.
  const panels=[panel((out,selector,...args)=>h.ctx[selector](...args)),
    panel((out,selector,...args)=>h.ctx[selector](...args)),
    panel((out,selector,...args)=>h.ctx[selector](...args))];
  for(let bank=0;bank<3;bank++){
    const box=h.ctx.patcher.getnamed('limits'+bank),message=box.message,p=panels[bank];
    box.message=function(selector,...args){message.call(this,selector,...args);if(typeof p.c[selector]==='function')p.c[selector](...args);};
  }
  h.initialize();h.ctx.setting(24,'hi',15);
  assert.equal(panels[0].c.bankIndex,0);assert.equal(panels[1].c.bankIndex,1);assert.equal(panels[2].c.bankIndex,2);
  const p=panels[2];p.c.onclick(6,103);p.c.ondrag(6,63,1);
  assert.equal(h.ctx.lanes[23].lo,20);assert.equal(h.ctx.lanes[23].hi,20);
  assert.equal(p.c.values[23][0],20);assert.equal(p.c.values[23][1],20);
  p.c.ondblclick(68,103);
  assert.equal(h.ctx.editorLane,23);assert.equal(h.ctx.editorKey,'hi');
  const rect=h.objects.get('bound_editor').messages.findLast(a=>a[0]==='presentation_rect');
  assert.deepEqual(rect,['presentation_rect',1016,138,56,14]);
  h.ctx.edited(20.123456789);
  assert.equal(h.ctx.lanes[23].hi,20.123456789);
  assert.equal(p.c.values[23][1],20.123456789);
  assert.equal(h.ctx.editorLane,-1);
  panels[0].c.onclick(6,103);panels[0].c.ondrag(6,93,1);
  assert.equal(h.ctx.lanes[7].lo,5);
  assert.equal(h.ctx.lanes[23].lo,20);
  for(let j=0;j<24;j++)for(let key=0;key<2;key++){
    panels[Math.floor(j/8)].c.ondblclick(key?68:6,(j%8)*14+5);
    assert.equal(h.ctx.editorLane,j);assert.equal(h.ctx.editorKey,key?'hi':'lo');
    const rect=h.objects.get('bound_editor').messages.findLast(a=>a[0]==='presentation_rect');
    assert.deepEqual(rect,['presentation_rect',Math.floor(j/8)*360+(key?296:234),40+(j%8)*14,56,14]);
    h.ctx.dismiss();
  }
});

test('formatted native units update tooltips only on hover changes',()=>{
  const p=panel();p.c.units(1,'0.010 Hz','20.000 Hz');
  p.c.onidle(6,5);assert.match(p.hints.at(-1)[1],/0.010 Hz/);
  const before=p.hints.length;p.c.onidle(7,5);assert.equal(p.hints.length,before);
  p.c.onidle(68,5);assert.match(p.hints.at(-1)[1],/20.000 Hz/);
});
