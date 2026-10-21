const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {makeHost}=require('./host.cjs');

function panel(callback){
  const events=[],drawn=[],hints=[];let redraws=0;
  const graphics={init(){},redraw(){redraws++;},set_source_rgba(){},rectangle(){},fill(){},
    select_font_face(){},set_font_size(){},move_to(){},show_text(s){drawn.push(s);}};
  const c={mgraphics:graphics,box:{rect:[0,0,720,112],message(...a){hints.push(a);}},
    outlet(...args){events.push(args);if(callback)callback(...args);}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/rm16_v3_limits.js'),'utf8'),c);
  return{c,events,drawn,hints,get redraws(){return redraws;}};
}

test('one panel renders all 32 rounded numbers while retaining their exact precision',()=>{
  const p=panel();
  for(let j=0;j<16;j++)p.c.row(j+1,12.3456789+j,99.123456789);
  p.c.paint();assert.equal(p.drawn.length,32);assert.equal(p.events.length,0);
  for(let j=0;j<16;j++){
    assert.equal(p.c.values[j][0],12.3456789+j);assert.equal(p.c.values[j][1],99.123456789);
    assert.equal(p.drawn[2*j],String(Math.round(12.3456789+j)));
  }
});

test('unchanged bounds never request a redraw and bad rows are ignored',()=>{
  const p=panel();p.c.row(1,0,100);assert.equal(p.redraws,0);
  for(const number of [0,-1,17,1.5,NaN])p.c.row(number,20,80);
  p.c.row(1,NaN,80);assert.equal(p.redraws,0);
  p.c.row(1,20,80);assert.equal(p.redraws,1);
  p.c.row(1,20,80);assert.equal(p.redraws,1);
});

test('every visible min/max field resolves to the right row, column and keyboard request',()=>{
  const p=panel();
  for(let j=0;j<16;j++)for(let key=0;key<2;key++){
    const x=Math.floor(j/8)*360+(key?300:240),y=(j%8)*14+5;
    p.c.onclick(x,y);p.c.ondblclick(x,y);
    assert.deepEqual(p.events.at(-1),[0,'edit',j+1,key?'hi':'lo']);
  }
  const before=p.events.length;
  p.c.onclick(100,1);p.c.ondblclick(100,1);assert.equal(p.events.length,before);
});

test('dragging requests integer steps and clamps output without changing the stored value itself',()=>{
  const p=panel();p.c.row(1,12.3456789,100);
  p.c.onclick(240,12);p.c.ondrag(240,12,1);
  assert.equal(p.events.filter(a=>a[1]==='setting').length,0);
  p.c.ondrag(240,10,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',13]);
  assert.equal(p.c.values[0][0],12.3456789);
  p.c.ondrag(240,-1000,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',100]);
  p.c.ondrag(240,1000,1);assert.deepEqual(p.events.at(-1),[0,'setting',1,'lo',0]);
  const count=p.events.length;p.c.ondrag(240,1000,0);p.c.ondrag(240,500,1);
  assert.equal(p.events.length,count);
});

test('panel and controller share one owner for crossing bounds and decimal keyboard edits',()=>{
  const h=makeHost();let p=panel((out,selector,...args)=>h.ctx[selector](...args));
  const box=h.ctx.patcher.getnamed('limits'),message=box.message;
  box.message=function(selector,...args){message.call(this,selector,...args);if(typeof p.c[selector]==='function')p.c[selector](...args);};
  h.initialize();h.ctx.setting(16,'hi',15);
  p.c.onclick(600,103);p.c.ondrag(600,63,1);
  assert.equal(h.ctx.lanes[15].lo,20);assert.equal(h.ctx.lanes[15].hi,20);
  assert.equal(p.c.values[15][0],20);assert.equal(p.c.values[15][1],20);
  p.c.ondblclick(665,103);
  assert.equal(h.ctx.editorLane,15);assert.equal(h.ctx.editorKey,'hi');
  const rect=h.objects.get('bound_editor').messages.findLast(a=>a[0]==='presentation_rect');
  assert.deepEqual(rect,['presentation_rect',656,138,56,14]);
  h.ctx.edited(20.123456789);
  assert.equal(h.ctx.lanes[15].hi,20.123456789);
  assert.equal(p.c.values[15][1],20.123456789);
  assert.equal(h.ctx.editorLane,-1);
});

test('formatted native units update tooltips only on hover changes',()=>{
  const p=panel();p.c.units(1,'0.010 Hz','20.000 Hz');
  p.c.onidle(240,5);assert.match(p.hints.at(-1)[1],/0.010 Hz/);
  const before=p.hints.length;p.c.onidle(241,5);assert.equal(p.hints.length,before);
  p.c.onidle(300,5);assert.match(p.hints.at(-1)[1],/20.000 Hz/);
});
