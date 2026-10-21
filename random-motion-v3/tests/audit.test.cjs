const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {makeHost}=require('./host.cjs');
const targets=[111,112,121,122,131,132,31,32,41,42,51,52,113,114,123,124];

test('V3 preserves v4.1 native value/duration commands, deadlines and PRNG states exactly',()=>{
  for(const mixed of [false,true]){
    const before=makeHost(0,0,true),after=makeHost();
    for(const h of [before,after]){
      h.initialize();targets.forEach((id,j)=>{
        if(mixed&&j%2)Object.assign(h.db.get(id),{min:-2,max:5,value:0,is_quantized:1});
        h.map(j+1,id);
      });
    }
    const commands=h=>h.events.filter(([out])=>out===0);
    assert.deepEqual(commands(before),commands(after));
    before.events.length=after.events.length=0;
    for(let k=0;k<20000;k++){
      assert.equal(after.ctx.motionTask.ms,before.ctx.motionTask.ms);
      before.fireMotion();after.fireMotion();
      assert.deepEqual(commands(after),commands(before));
      for(let j=0;j<16;j++){
        const a=after.ctx.lanes[j].motion,b=before.ctx.lanes[j].motion;
        assert.equal(a.a,b.a);assert.equal(a.b,b.b);assert.equal(a.next,b.next);
      }
      before.events.length=after.events.length=0;
    }
  }
});

test('the 16 continuous slots share the original rules, not shared trajectories',()=>{
  const h=makeHost();h.initialize();targets.forEach((id,j)=>h.map(j+1,id));
  for(let j=0;j<16;j++){
    let jumps=0,short=0,long=0,interruptions=0,sumWait=0;
    for(let k=0;k<20000;k++){
      const l=h.ctx.lanes[j],t=l.motion.next;h.ctx.emit(j,t);
      const m=l.motion;jumps+=m.duration===0;short+=m.duration>0&&m.duration<20;
      long+=m.duration>1000;interruptions+=m.next<t+m.duration;sumWait+=m.next-t;
      if(k%100===0)h.events.length=0;
    }
    assert.ok(jumps/20000>.165&&jumps/20000<.195);
    assert.ok(short>3000&&long>4000&&interruptions>5000);
    assert.ok(sumWait/20000>145&&sumWait/20000<180);
  }
});

test('all 16 bool/enum slots use legal integer states without ramp commands',()=>{
  const h=makeHost();h.initialize();
  targets.forEach((id,j)=>{
    const size=[2,5,17][j%3];Object.assign(h.db.get(id),{min:0,max:size-1,value:0,is_quantized:1});h.map(j+1,id);
  });
  for(let j=0;j<16;j++){
    const size=[2,5,17][j%3],counts=Array(size).fill(0);
    for(let k=0;k<20000;k++){
      h.ctx.emit(j,h.ctx.lanes[j].motion.next);
      const [,a]=h.events.at(-1);assert.ok(Number.isInteger(a[1])&&a[1]>=0&&a[1]<size);
      assert.equal(a[2],0);counts[a[1]]++;
      if(k%100===0)h.events.length=0;
    }
    for(const count of counts)assert.ok(Math.abs(count/20000-1/size)<.017);
  }
});

test('continuous units retain the same normalized trajectory for equal seeds',()=>{
  const samples=[];
  for(const [min,max] of [[0,1],[-1,1],[-60,6],[20,20000],[.01,20]]){
    const h=makeHost();Object.assign(h.db.get(111),{min,max,value:min+(max-min)*.37});
    h.ctx.newSeed=()=>123456789;h.initialize();h.map(1,111);
    const a=[];
    for(let k=0;k<2000;k++){
      const m=h.ctx.lanes[0].motion;a.push([m.target,m.duration,m.next]);
      h.ctx.emit(0,m.next);h.events.length=0;
    }
    samples.push(a);
  }
  for(const a of samples)for(let k=0;k<a.length;k++){
    assert.ok(Math.abs(a[k][0]-samples[0][k][0])<1e-12);
    assert.equal(a[k][1],samples[0][k][1]);assert.equal(a[k][2],samples[0][k][2]);
  }
});

test('steady-state modulation needs no API reads, UI messages, lookups or Task.cancel calls',()=>{
  const h=makeHost();h.initialize();targets.forEach((id,j)=>h.map(j+1,id));
  const counters={...h.counters},calls=h.apiCalls;
  for(let k=0;k<5000;k++){h.fireMotion();if(k%100===0)h.events.length=0;}
  assert.equal(h.apiCalls,calls);
  assert.equal(h.counters.uiMessages,counters.uiMessages);
  assert.equal(h.counters.lookups,counters.lookups);
  assert.equal(h.counters.cancels,counters.cancels);
  assert.equal(h.counters.schedules-counters.schedules,5000);
});

test('only moving slots are scanned; unbound and constant slots leave no running entries',()=>{
  const h=makeHost();h.initialize();h.map(12,111);
  assert.deepEqual(Array.from(h.ctx.running),[11]);
  h.ctx.setting(12,'lo',100);assert.equal(h.ctx.running.length,0);
  assert.equal(h.ctx.motionTask.scheduled,false);
  h.ctx.setting(12,'lo',0);assert.deepEqual(Array.from(h.ctx.running),[11]);
  h.ctx.clear(12);assert.equal(h.ctx.running.length,0);
});

test('batch bypass performs one timer cancellation instead of one per lane',()=>{
  const h=makeHost();h.initialize();targets.forEach((id,j)=>h.map(j+1,id));
  let cancels=0;const cancel=h.ctx.motionTask.cancel;
  h.ctx.motionTask.cancel=function(){cancels++;return cancel.call(this);};
  h.ctx.active(0);assert.equal(cancels,1);assert.equal(h.ctx.running.length,0);
});

test('unchanged limits do not consume randomness or notify saved-state clients',()=>{
  const h=makeHost();h.initialize();h.map(1,111);
  const before=JSON.stringify(h.ctx.lanes[0].motion),notifications=h.notifications;
  h.ctx.setting(1,'lo',0);h.ctx.setting(1,'hi',100);
  assert.equal(JSON.stringify(h.ctx.lanes[0].motion),before);
  assert.equal(h.notifications,notifications);
});

test('repeated mapping releases prior API handles and never observes changing values',()=>{
  const h=makeHost();h.initialize();h.map(1,111);
  const old=h.ctx.lanes[0].param;h.ctx.clear(1);assert.equal(old._id,0);
  for(let k=0;k<100;k++){
    h.select(0);h.map(1,k%2?111:112);
  }
  assert.equal(h.observers.filter(o=>o._property==='name'&&Number(o.id)>0).length,2);
  assert.equal(h.observers.filter(o=>o._property==='value').length,0);
});

test('old target callbacks cannot refresh a replacement mapping',()=>{
  const h=makeHost();h.initialize();h.map(1,111);const old=h.ctx.lanes[0].param;
  h.ctx.clear(1);h.map(1,112);h.ctx.refreshTask.cancel();h.ctx.refreshQueued=false;
  old.callback(['id',0]);assert.equal(h.ctx.refreshTask.scheduled,false);
  assert.equal(h.ctx.lanes[0].id,112);
});

test('target and device renames refresh saved signatures without polling values',()=>{
  const h=makeHost();h.initialize();h.map(1,111);
  h.rename(110,'Renamed Delay');h.rename(111,'Renamed Time');
  assert.equal(h.ctx.refreshTask.scheduled,true);h.ctx.refreshTask.fire();
  const link=JSON.parse(h.ctx.getvalueof()).lanes[0].link;
  assert.equal(link.signature.deviceName,'Renamed Delay');
  assert.equal(link.signature.parameterName,'Renamed Time');
  assert.match(link.label,/Renamed Delay.*Renamed Time/);
});

test('device-context changes reconnect native ramps without new random draws or deadlines',()=>{
  const h=makeHost();h.initialize();h.map(1,111);
  const m=h.ctx.lanes[0].motion;
  Object.assign(m,{from:.2,target:.8,began:h.ctx.now(),duration:2000,next:h.ctx.now()+500});
  const before=JSON.stringify(m);h.advance(100);const start=h.events.length;
  h.ctx.contextchanged();h.ctx.refreshTask.fire();
  const sent=h.events.slice(start);
  assert.deepEqual(sent.filter(([o])=>o===1),[[1,[1,'id',0]],[1,[1,'id',111]]]);
  const commands=sent.filter(([o])=>o===0).map(([,a])=>a);
  assert.ok(Math.abs(commands[0][1]-46)<1e-10);assert.equal(commands[0][2],0);
  assert.deepEqual(commands[1],[1,160,1900]);
  assert.equal(JSON.stringify(m),before);
});

test('sibling-chain reorders are observed at their ancestor, not only at the nearest chain',()=>{
  const h=makeHost();h.initialize();h.map(1,131);
  const watcher=h.observers.find(o=>o._id===5&&o._property==='chains');
  assert.ok(watcher);h.db.get(5).chains=[20,10];watcher.callback(['chains','id',20,'id',10]);
  h.ctx.refreshTask.fire();const saved=JSON.parse(h.ctx.getvalueof());
  assert.equal(saved.lanes[0].link.tail[1],'0');
  assert.equal(h.ctx.lanes[0].id,131);
});

test('one restore failure, one output failure and a UI exception remain isolated',()=>{
  const a=makeHost();a.initialize();a.map(1,111);a.map(2,112);
  const b=makeHost(1000,1),resolve=b.ctx.resolve;
  b.ctx.resolve=l=>{if(l.tail.at(-1)==='0')throw Error('bad saved target');return resolve(l);};
  b.ctx.setvalueof(a.ctx.getvalueof());b.initialize();assert.ok(b.ctx.lanes[1].attached);
  const ui=b.ctx.patcher.getnamed;b.ctx.patcher.getnamed=()=>{throw Error('unavailable UI');};
  b.ctx.uiCache={};b.ctx.setting(2,'lo',10);
  assert.ok(b.ctx.lanes[1].attached);b.ctx.patcher.getnamed=ui;
});

test('malformed paths cannot escape the local track or replace valid mappings',()=>{
  const h=makeHost();h.initialize();h.map(1,111);const before=h.ctx.getvalueof();
  h.ctx.setvalueof('null');h.ctx.setvalueof('{"version":999,"lanes":[]}');
  assert.equal(h.ctx.getvalueof(),before);
  for(const token of ['canonical_parent','live_set','id','../../tracks']){
    const s=JSON.parse(before);s.lanes[0].link.tail=[token,'0'];
    h.ctx.setvalueof(JSON.stringify(s));assert.equal(h.ctx.lanes[0].link,null);
  }
});

test('recalling an empty state stops modulation and updates status without a pointless restore timer',()=>{
  const h=makeHost();h.initialize();h.map(1,111);
  h.ctx.setvalueof(JSON.stringify({version:5,lanes:[]}));
  assert.equal(h.ctx.running.length,0);assert.equal(h.ctx.motionTask.scheduled,false);
  assert.equal(h.ctx.restoreTask.scheduled,false);
  assert.deepEqual(h.objects.get('health').messages.at(-1),['set','BEREIT']);
});

test('a failed native release stays visible and can be retried after state recall',()=>{
  const h=makeHost();h.initialize();h.map(1,111);const remote=h.ctx.remote;
  h.ctx.remote=function(j,id){if(j===0&&id===0)throw Error('release failed');return remote(j,id);};
  h.ctx.setvalueof(JSON.stringify({version:5,lanes:[]}));
  assert.equal(h.ctx.lanes[0].error,'Freigabe pruefen');
  assert.equal(h.ctx.lanes[0].remoteMayBeBound,true);
  h.ctx.remote=remote;h.ctx.clear(1);
  assert.equal(h.ctx.lanes[0].error,'');assert.equal(h.ctx.lanes[0].remoteMayBeBound,false);
});

test('bad wall-clock samples are ignored and backward jumps cannot reverse logical time',()=>{
  const h=makeHost();h.initialize();h.map(1,111);const t=h.ctx.now();
  h.setClock(NaN);assert.equal(h.ctx.now(),t);
  h.setClock(Infinity);assert.equal(h.ctx.now(),t);
  h.setClock(0);assert.equal(h.ctx.now(),t);
  h.setClock(100);assert.equal(h.ctx.now(),t+100);
});

test('cleanup disposes observers, releases all bindings and leaves no owned timer',()=>{
  const h=makeHost();h.initialize();targets.forEach((id,j)=>h.map(j+1,id));
  h.ctx.contextchanged();h.ctx.notifydeleted();
  assert.ok(h.tasks.every(t=>!t.scheduled));
  assert.equal(h.observers.filter(o=>o._property).length,0);
  assert.equal(h.ctx.running.length,0);
});

test('2000 configuration/lifecycle operations keep all surviving targets bounded and scheduled',()=>{
  const h=makeHost();h.initialize();targets.forEach((id,j)=>h.map(j+1,id));
  const command=h.ctx.command;
  h.ctx.command=function(j,value,duration){
    const l=h.ctx.lanes[j],lo=l.pmin+(l.pmax-l.pmin)*l.lo/100,hi=l.pmin+(l.pmax-l.pmin)*l.hi/100;
    assert.ok(Number.isFinite(value+duration));assert.ok(value>=lo-1e-9&&value<=hi+1e-9);
    return command(j,value,duration);
  };
  let seed=1234567;
  const pick=n=>{seed=seed*48271%2147483647;return seed%n;};
  for(let n=0;n<2000;n++){
    const j=pick(16),kind=pick(5);
    if(kind===0){h.ctx.setting(j+1,'lo',pick(100));h.ctx.setting(j+1,'hi',pick(101));}
    else if(kind===1){h.ctx.active(0);h.ctx.active(1);}
    else if(kind===2){h.ctx.clear(j+1);h.select(0);h.map(j+1,targets[j]);}
    else if(kind===3){const state=h.ctx.getvalueof();h.ctx.setvalueof(state);h.ctx.restoreTask.fire();}
    else {h.advance(1000);if(h.ctx.motionTask.scheduled)h.fireMotion();}
    if(n===1000){const time=h.ctx.now();h.jumpClock(-60000);assert.ok(h.ctx.now()>=time);}
    assert.equal(h.tasks.length,5);h.events.length=0;
  }
  assert.ok(h.ctx.lanes.every(l=>l.attached));
  assert.ok(h.ctx.running.every(j=>h.ctx.lanes[j].attached&&Number.isFinite(h.ctx.lanes[j].motion.next)));
});

test('16 PRNG streams pass a correlation sanity check with independent seeds',()=>{
  const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/rm16_v3_motion.js'),'utf8'),c);
  const states=Array.from({length:16},(_,j)=>c.RM16.create(123457+j*15485863,.5,0));
  const sums=Array(16).fill(0),squares=Array(16).fill(0),cross=Array.from({length:16},()=>Array(16).fill(0)),N=20000;
  for(let n=0;n<N;n++){
    const x=states.map(s=>c.RM16.random(s));
    for(let j=0;j<16;j++){sums[j]+=x[j];squares[j]+=x[j]*x[j];for(let k=0;k<j;k++)cross[j][k]+=x[j]*x[k];}
  }
  for(let j=0;j<16;j++)for(let k=0;k<j;k++){
    const r=(N*cross[j][k]-sums[j]*sums[k])/Math.sqrt((N*squares[j]-sums[j]**2)*(N*squares[k]-sums[k]**2));
    assert.ok(Math.abs(r)<.04);
  }
});
