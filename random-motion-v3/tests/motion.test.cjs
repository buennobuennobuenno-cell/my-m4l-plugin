"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,"../src/rm16_v3_motion.js"),"utf8"),ctx);
const M=ctx.RM16;let checks=0;
const nodeTest=require("node:test");
function test(name,fn){nodeTest(name,fn);}
test("PRNG stays in its open range with sensible mean and lag-one correlation",()=>{
 const s=M.create(1324567,.5,0);let sum=0,cross=0,last=.5;
 for(let n=0;n<200000;n++){const u=M.random(s);assert(u>0&&u<1);sum+=u;cross+=(u-.5)*(last-.5);last=u;}
 assert(Math.abs(sum/200000-.5)<.005);assert(Math.abs(cross/200000)<.002);
});
test("each lane has its own stream and consuming another lane cannot alter it",()=>{
 const a=M.create(54321,.5,0),reference=M.create(54321,.5,0),other=M.create(76543,.5,0);
 let differences=0;
 for(let n=0;n<10000;n++){
  for(let j=0;j<n%7;j++)M.random(other);
  assert.equal(M.random(a),M.random(reference));
  differences+=M.random(other)!==M.random(reference);
  M.random(a); // align a with reference after the comparison above
 }
 assert(differences>9990);
});
test("duration, value, scale and deadline vary per event; endpoints and jumps remain possible",()=>{
 const s=M.create(456789,.5,0);let zero=0,ones=0,jumps=0,short=0,long=0,early=0,holds=0,tiny=0;
 for(let n=0;n<30000;n++){
  const t=s.next;M.next(s,0,1,t);
  assert(Number.isFinite(s.target+s.duration+s.next)&&s.target>=0&&s.target<=1);
  assert(s.duration===0||(s.duration>=1&&s.duration<60000));
  assert(s.next-t>=1&&s.next-t<22000);
  zero+=s.target===0;ones+=s.target===1;jumps+=s.duration===0;
  short+=s.duration>0&&s.duration<5;long+=s.duration>2000;
  early+=s.next<t+s.duration;holds+=s.next>t+s.duration;
  tiny+=Math.abs(s.target-s.from)<.001;
 }
 assert(zero>100&&ones>100&&jumps>4000&&jumps<6500);
 assert(short>1000&&long>1000&&early>1000&&holds>1000&&tiny>1000);
});
test("native ramp position estimate is continuous until a new command and handles interruptions",()=>{
 const s=M.create(123,.5,0);s.from=.2;s.target=.8;s.began=100;s.duration=2000;
 assert.equal(M.position(s,100),.2);assert(Math.abs(M.position(s,1100)-.5)<1e-14);
 assert.equal(M.position(s,9999),.8);
 M.next(s,0,1,101);assert(Math.abs(s.from-.2003)<1e-12);
});
test("edited ranges constrain new targets and the starting estimate",()=>{
 const s=M.create(99999,.98,0);
 for(let n=0;n<30000;n++){
  const low=(n%500)/1000,high=low+.00001;
  M.next(s,low,high,s.next);
  assert(s.target>=low&&s.target<=high&&s.from>=low&&s.from<=high);
 }
});
const modelSeconds=Number(process.env.RM16_MODEL_SECONDS||1800);
let report;
test("sixteen independent streams remain active and bounded through the long model run",()=>{
 const lanes=Array.from({length:16},(_,i)=>M.create(1000003+i*15485863,.5,0));
 const previous=Array(16).fill(0),counts=Array(16).fill(0);let maxGap=0,total=0,time=0;
 while(true){
  let j=0;for(let i=1;i<16;i++)if(lanes[i].next<lanes[j].next)j=i;
  time=lanes[j].next;if(time>modelSeconds*1000)break;
  maxGap=Math.max(maxGap,time-previous[j]);previous[j]=time;
  M.next(lanes[j],0,1,time);counts[j]++;total++;
  assert(Number.isFinite(lanes[j].target)&&lanes[j].target>=0&&lanes[j].target<=1);
  assert(total<modelSeconds*1000);
 }
 assert(counts.every(n=>n>8000));assert(new Set(counts).size>8);assert(maxGap<22000);
 report={scope:"event arithmetic model only; excludes Max Task scheduling, native ramps, Live and target DSP",
   seconds:modelSeconds,lanes:16,events:total,events_per_second:total/modelSeconds,per_lane:counts,max_event_gap_ms:maxGap};
 if(process.env.RM16_REPORT_PATH){
  const output=path.resolve(process.env.RM16_REPORT_PATH);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 }
});
