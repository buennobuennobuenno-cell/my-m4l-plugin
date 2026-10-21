"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm");
const {makeHost,source}=require("./host.cjs");
let checks=0;
const nodeTest=require("node:test");
function test(name,fn){nodeTest(name,fn);}
test("selected-parameter mapping ignores the baseline and defers API access",()=>{
 const h=makeHost();h.initialize();h.select(111);h.ctx.map(1,1);assert(!h.ctx.mapTask.scheduled);
 h.select(112);assert(h.ctx.mapTask.scheduled);assert.equal(h.ctx.lanes[0].id,0);
 h.select(111);assert(!h.ctx.mapTask.scheduled);h.select(112);h.ctx.mapTask.fire();assert.equal(h.ctx.lanes[0].id,112);
});
test("Chain Volume is supported as a ChainMixerDevice parameter",()=>{
 const h=makeHost();h.initialize();h.map(1,31);const l=h.ctx.lanes[0];
 assert.equal(l.id,31);assert.equal(l.link.signature.ownerType,"ChainMixerDevice");
 assert.deepEqual(Array.from(l.link.tail),["mixer_device","volume"]);assert.equal(l.link.up,1);
 assert.equal(l.lo,0);assert.equal(l.hi,100);assert(h.ctx.motionTask.scheduled);
});
test("track volume and a sibling chain can be mapped on the same track",()=>{
 const h=makeHost();h.initialize();h.map(1,41);assert.equal(h.ctx.lanes[0].link.up,3);
 h.map(2,131);assert.equal(h.ctx.lanes[1].link.up,2);assert.equal(h.ctx.lanes[1].link.anchorType,"RackDevice");
});
test("a copied complete rack resolves its own effects and its own chain volume",()=>{
 const a=makeHost();a.initialize();a.map(1,111);a.map(2,31);a.map(3,131);
 a.ctx.setting(2,"lo",20);a.ctx.setting(2,"hi",95);const state=a.ctx.getvalueof();
 assert(!state.includes('"id":')&&!state.includes("live_set")&&!state.includes("seed"));
 const b=makeHost(1000,2);b.ctx.setvalueof(state);b.initialize();
 assert.equal(b.ctx.lanes[0].id,1111);assert.equal(b.ctx.lanes[1].id,1031);assert.equal(b.ctx.lanes[2].id,1131);
 assert.equal(b.ctx.lanes[1].lo,20);assert.equal(b.ctx.lanes[1].hi,95);
 assert.notEqual(a.ctx.lanes[0].motion.a,b.ctx.lanes[0].motion.a);
});
test("reordering devices retains a relative reference to the mapped device",()=>{
 const h=makeHost();h.initialize();h.map(1,111);assert.equal(h.ctx.lanes[0].link.tail[1],"1");
 h.db.get(10).devices=[110,100,120];h.chainChanged();h.ctx.refreshTask.fire();assert.equal(h.ctx.lanes[0].link.tail[1],"-1");
 const state=h.ctx.getvalueof();h.ctx.setvalueof(state);h.ctx.restoreTask.fire();assert.equal(h.ctx.lanes[0].id,111);
});
test("changed parameter fingerprints prevent unchecked reattachment",()=>{
 const a=makeHost();a.initialize();a.map(1,111);
 const b=makeHost(1000,1);b.ctx.setvalueof(a.ctx.getvalueof());b.db.get(1110).class_name="Changed";b.initialize();
 assert.equal(b.ctx.lanes[0].id,0);assert(!b.ctx.lanes[0].attached);
});
test("a dynamic display name keeps the stable original parameter identity",()=>{
 const a=makeHost();a.initialize();a.db.get(111).original_name="Stable Time";a.map(1,111);
 const b=makeHost(1000,1);b.ctx.setvalueof(a.ctx.getvalueof());
 b.db.get(1111).original_name="Stable Time";b.db.get(1111).name="Different Mode Label";b.initialize();
 assert.equal(b.ctx.lanes[0].id,1111);
});
test("one parameter cannot be controlled by two slots",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.select(112);h.ctx.map(2,1);h.select(111);h.ctx.mapTask.fire();
 assert.equal(h.ctx.lanes[0].id,111);assert.equal(h.ctx.lanes[1].id,0);
});
test("malformed state does not start a remote mapping",()=>{
 const h=makeHost();h.initialize();h.ctx.setvalueof("bad json");
 const s=JSON.parse(h.ctx.getvalueof());s.lanes[0].link={up:"bad"};h.ctx.setvalueof(JSON.stringify(s));assert.equal(h.ctx.lanes[0].link,null);
});
test("other-track targets are rejected rather than creating ambiguous copied mappings",()=>{
 const h=makeHost();h.initialize();h.db.get(900000).tracks.push(2);
 h.db.set(2,{type:"Track",canonical_parent:900000,name:"Elsewhere",devices:[500]});
 h.db.set(500,{type:"Device",canonical_parent:2,name:"Utility",class_name:"StereoGain",parameters:[501]});
 h.db.set(501,{type:"DeviceParameter",canonical_parent:500,name:"Gain",min:0,max:1});
 h.map(1,501);assert.equal(h.ctx.lanes[0].id,0);
});
test("native keyboard editor retains decimals and closes after commit",()=>{
 const h=makeHost();h.initialize();h.ctx.edit(1,"lo");
 assert.deepEqual(h.objects.get("bound_editor").messages.slice(-2),[["hidden",0],["select"]]);
 h.ctx.setting(1,"lo",12.3456789);
 assert.equal(h.ctx.lanes[0].lo,12.3456789);
 assert.equal(h.ctx.lanes[0].lo/100,12.3456789/100);
 assert.deepEqual(h.objects.get("bound_editor").messages.at(-1),["hidden",1]);
});
test("sixteen default slots and only one shared motion task",()=>{
 const h=makeHost();h.initialize();assert.equal(h.tasks.length,5);assert.equal(h.ctx.lanes.length,16);
 for(const l of h.ctx.lanes){assert.equal(l.lo,0);assert.equal(l.hi,100);assert(!l.attached);}
 assert(!h.ctx.motionTask.scheduled);assert(!/\b(?:const|let|async|await)\s/.test(source));
});
test("mapping attaches the target before sending native ramp commands and starts automatically",()=>{
 const h=makeHost();h.initialize();h.map(16,111);
 const attach=h.events.findIndex(([o,a])=>o===1&&a[0]===16&&a[2]===111);
 const first=h.events.findIndex(([o,a])=>o===0&&a[0]===16);
 assert(attach>=0&&first>attach);assert(h.ctx.motionTask.scheduled);
 assert(h.ctx.lanes[15].motion.events>0);
});
test("actual native Hz/dB/bipolar ranges are used without a normalized attribute",()=>{
 for(const range of [{min:.01,max:20,unit:"Hz"},{min:20,max:20000,unit:"Hz"},{min:-60,max:6,unit:"dB"},{min:-1,max:1,unit:"Pan"}]){
  const h=makeHost();Object.assign(h.db.get(111),range);h.initialize();h.map(1,111);
  for(let n=0;n<200;n++)h.fireMotion();
  const messages=h.events.filter(([o,a])=>o===0&&a[0]===1);
  assert(messages.length>100);
  for(const [,a]of messages){assert(a.length===3&&a[1]>=range.min&&a[1]<=range.max&&a[2]>=0&&a[2]<=60000);}
  h.ctx.setting(1,"lo",100);h.ctx.setting(1,"hi",100);
  assert.equal(h.events.filter(([o,a])=>o===0).at(-1)[1][1],range.max);
  assert(!h.ctx.motionTask.scheduled);
 }
});
test("changed decimal Min/Max immediately stop old ramps and constrain every later command",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.ctx.setting(1,"lo",12.3456789);h.ctx.setting(1,"hi",29.1234567);
 const from=h.events.length;for(let n=0;n<500;n++)h.fireMotion();
 for(const [o,a]of h.events.slice(from))if(o===0){assert(a[1]>=24.6913578-1e-10&&a[1]<=58.2469134+1e-10);}
 h.ctx.setting(1,"lo",80);assert.equal(h.ctx.lanes[0].hi,80);assert(!h.ctx.motionTask.scheduled);
});
test("all sixteen targets persist, restore and have different deadlines and trajectories",()=>{
 const h=makeHost();h.initialize();
 const targets=[111,112,121,122,131,132,31,32,41,42,51,52,113,114,123,124];
 targets.forEach((id,i)=>h.map(i+1,id));
 assert(h.ctx.lanes.every(l=>l.attached));
 assert(new Set(h.ctx.lanes.map(l=>l.motion.next)).size>=12);
 assert(new Set(h.ctx.lanes.map(l=>l.motion.target)).size>=12);
 const saved=h.ctx.getvalueof();assert.equal(JSON.parse(saved).version,5);
 h.ctx.setvalueof(saved);h.ctx.restoreTask.fire();assert(h.ctx.lanes.every(l=>l.attached));
 for(let n=0;n<2000;n++)h.fireMotion();
 assert(h.ctx.lanes.every(l=>l.motion.events>20));
 assert(new Set(h.ctx.lanes.map(l=>l.motion.events)).size>1);
});
test("adding or configuring another lane does not reset an existing lane's stream or deadline",()=>{
 const h=makeHost();h.initialize();h.map(1,111);
 const saved=JSON.stringify(h.ctx.lanes[0].motion);h.map(2,112);
 assert.equal(JSON.stringify(h.ctx.lanes[0].motion),saved);
 h.ctx.setting(2,"lo",30);assert.equal(JSON.stringify(h.ctx.lanes[0].motion),saved);
});
test("new events can interrupt a two-second native ramp without waiting for its end",()=>{
 const h=makeHost();h.initialize();h.map(1,111);const m=h.ctx.lanes[0].motion;
 m.from=0;m.target=1;m.began=h.ctx.now();m.duration=2000;m.next=m.began+3;
 const before=m.events;h.ctx.reschedule();h.fireMotion();
 assert.equal(m.events,before+1);assert(m.from>=0&&m.from<.01);
});
test("unmapping, bypass and deletion stop the scheduler and release targets",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.ctx.map(1,0);
 assert(!h.ctx.motionTask.scheduled);assert(!h.ctx.lanes[0].attached);
 h.map(1,112);h.ctx.active(0);assert(!h.ctx.motionTask.scheduled);
 h.ctx.active(1);assert(h.ctx.motionTask.scheduled);assert(h.ctx.lanes[0].attached);
 h.ctx.notifydeleted();assert(h.tasks.every(t=>!t.scheduled));assert(h.ctx.lanes.every(l=>!l.attached));
});
test("missing targets in a sibling chain are released without polling changing parameter values",()=>{
 const h=makeHost();h.initialize();h.map(1,131);h.db.delete(131);
 h.ctx.lanes[0].param.callback(["id",0]);h.ctx.refreshTask.fire();
 assert(!h.ctx.lanes[0].attached);assert(!h.ctx.motionTask.scheduled);
});
test("motion performs no Live API calls and never allocates a Task per event",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.map(2,112);
 const calls=h.apiCalls,tasks=h.tasks.length;for(let i=0;i<2000;i++)h.fireMotion();
 assert.equal(h.apiCalls,calls);assert.equal(h.tasks.length,tasks);
});
test("late callbacks generate at most one event per lane and do not replay missed work",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.map(2,112);
 const count=h.ctx.sentEvents;h.advance(3600000);h.ctx.tick();
 assert.equal(h.ctx.sentEvents,count+2);
 assert(h.ctx.lanes.every(l=>!l.attached||l.motion.next>h.ctx.now()));
});
test("switches use valid discrete states, empty ranges suspend and recover",()=>{
 const h=makeHost();Object.assign(h.db.get(111),{min:0,max:1,is_quantized:1});h.initialize();h.map(1,111);
 const start=h.events.length;for(let i=0;i<500;i++)h.fireMotion();
 const sent=h.events.slice(start).filter(([o])=>o===0).map(([,a])=>a);
 assert(sent.some(a=>a[1]===0)&&sent.some(a=>a[1]===1));assert(sent.every(a=>[0,1].includes(a[1])&&a[2]===0));
 h.ctx.setting(1,"lo",30);h.ctx.setting(1,"hi",70);
 assert(!h.ctx.lanes[0].attached);assert.equal(h.ctx.lanes[0].error,"Bereich leer");assert(!h.ctx.motionTask.scheduled);
 h.ctx.setting(1,"hi",100);assert(h.ctx.lanes[0].attached);assert(!h.ctx.motionTask.scheduled); // only state 1
 h.ctx.setting(1,"lo",0);assert(h.ctx.motionTask.scheduled);
});
test("old eight- and twelve-slot saved states restore into sixteen rows",()=>{
 for(const [version,count]of[[2,8],[3,12]]){
  const a=makeHost();a.initialize();a.map(1,111);const state=JSON.parse(a.ctx.getvalueof());
  state.version=version;state.lanes=state.lanes.slice(0,count);
  const b=makeHost(1000,1);b.ctx.setvalueof(JSON.stringify(state));b.initialize();
  assert.equal(b.ctx.lanes[0].id,1111);assert.equal(b.ctx.lanes.length,16);
  assert(b.ctx.lanes.slice(count).every(l=>!l.link&&l.lo===0&&l.hi===100));
 }
});
test("changing a target range on a chain refresh reconfigures its native units",()=>{
 const h=makeHost();h.initialize();h.map(1,111);
 h.db.get(111).min=-30;h.db.get(111).max=40;h.ctx.refresh();
 assert.equal(h.ctx.lanes[0].pmin,-30);assert.equal(h.ctx.lanes[0].pmax,40);
 for(let i=0;i<100;i++)h.fireMotion();
 assert(h.events.filter(([o])=>o===0).slice(-50).every(([,a])=>a[1]>=-30&&a[1]<=40));
});
test("bad slot messages do not mutate state or throw",()=>{
 const h=makeHost();h.initialize();const before=h.events.length;
 for(const n of [NaN,Infinity,0,-1,1.5,17,"oops"]){h.ctx.map(n,1);h.ctx.clear(n);h.ctx.setting(n,"lo",90);h.ctx.edit(n,"lo");}
 assert.equal(h.events.length,before);
});
test("a failed lane is isolated while other lanes and the common scheduler continue",()=>{
 const h=makeHost();h.initialize();h.map(1,111);h.map(2,112);
 const original=h.ctx.command;h.ctx.command=function(j,value,duration){if(j===0)throw Error("simulated output failure");return original(j,value,duration);};
 h.advance(100000);h.ctx.tick();
 assert(!h.ctx.lanes[0].attached);assert.equal(h.ctx.lanes[0].error,"Ausgabe pruefen");
 assert(h.ctx.lanes[1].attached&&h.ctx.motionTask.scheduled);
 const before=h.ctx.lanes[1].motion.events;h.fireMotion();assert(h.ctx.lanes[1].motion.events>before);
});
test("a nonfinite initial API value cannot poison the motion state",()=>{
 const h=makeHost();h.db.get(111).value=NaN;h.initialize();h.map(1,111);
 assert(Number.isFinite(h.ctx.lanes[0].motion.target));
 assert(h.events.filter(([o])=>o===0).every(([,a])=>Number.isFinite(a[1]+a[2])));
});
