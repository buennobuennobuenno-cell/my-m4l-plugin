"use strict";
const fs=require("node:fs"), path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"../src/rm16_v3_mapping.js"),"utf8");
let checks=0;
function test(name,fn){fn();checks++;console.log("PASS "+name);}

function makeHost(base=0,trackIndex=0,legacy=false){
 const db=new Map(),events=[],objects=new Map(),observers=[],tasks=[];
 let selected=0,notifications=0,apiCalls=0,time=100000;
 const counters={schedules:0,cancels:0,lookups:0,uiMessages:0,clockReads:0};
 const id=n=>base+n, refs=ids=>ids.flatMap(n=>["id",n]);
 const add=(n,record)=>db.set(id(n),record);
 const parent=n=>id(n);
 db.set(900000,{type:"Song",tracks:Array.from({length:trackIndex+1},(_,n)=>n===trackIndex?id(1):800000+n)});
 add(1,{type:"Track",canonical_parent:900000,name:"Track "+trackIndex,devices:[id(5)],mixer_device:id(40)});
 add(5,{type:"RackDevice",canonical_parent:parent(1),name:"Rack",class_name:"AudioEffectGroupDevice",chains:[id(10),id(20)]});
 add(10,{type:"Chain",canonical_parent:parent(5),name:"Wet",devices:[id(100),id(110),id(120)],mixer_device:id(30)});
 add(20,{type:"Chain",canonical_parent:parent(5),name:"Other",devices:[id(130)],mixer_device:id(50)});
 add(100,{type:"MaxDevice",canonical_parent:parent(10),name:"Random Motion 12",class_name:"MxDeviceAudioEffect",parameters:[]});
 for(const [n,chain,cls,name] of [[110,10,"MxDeviceAudioEffect","Align Delay"],[120,10,"AutoPan","Auto Pan"],[130,20,"AutoFilter","Auto Filter"]]){
  add(n,{type:"Device",canonical_parent:parent(chain),name,class_name:cls,parameters:[id(n+1),id(n+2)]});
  for(let k=1;k<=2;k++)add(n+k,{type:"DeviceParameter",canonical_parent:parent(n),name:k===1?"Time L":"Time R",min:0,max:200,value:.2});
 }
 for(const [n,owner,type]of[[30,10,"ChainMixerDevice"],[40,1,"MixerDevice"],[50,20,"ChainMixerDevice"]]){
  add(n,{type,canonical_parent:parent(owner),volume:id(n+1),panning:id(n+2)});
  add(n+1,{type:"DeviceParameter",canonical_parent:parent(n),name:"Volume",min:0,max:1,value:.8});
  add(n+2,{type:"DeviceParameter",canonical_parent:parent(n),name:"Pan",min:-1,max:1,value:0});
 }
 for(const [n,owner]of[[113,110],[114,110],[123,120],[124,120]]){
  db.get(id(owner)).parameters.push(id(n));add(n,{type:"DeviceParameter",canonical_parent:parent(owner),name:"Extra "+n,min:0,max:1,value:.5});
 }
 function objectPath(oid){
  if(oid===900000)return "live_set";
  const obj=db.get(oid);if(!obj)return "";
  const owner=db.get(obj.canonical_parent);if(!owner)return "";
  for(const key of ["tracks","devices","chains","parameters","mixer_device","volume","panning"]){
   if(Array.isArray(owner[key])){const index=owner[key].indexOf(oid);if(index>=0)return objectPath(obj.canonical_parent)+" "+key+" "+index;}
   else if(owner[key]===oid)return objectPath(obj.canonical_parent)+" "+key;
  }return "";
 }
 function resolve(p){
  const tokens=p.split(" ");if(tokens.shift()!=="live_set")return 0;
  let oid=900000;
  while(tokens.length){const key=tokens.shift(),node=db.get(oid);if(!node)return 0;
   const v=node[key];oid=Array.isArray(v)?v[Number(tokens.shift())]:v;
   if(!oid)return 0;
  }return db.has(oid)?oid:0;
 }
 function LiveAPI(callback,p){
  apiCalls++;this.callback=callback;this._property="";
  this._id=p==="this_device"?id(100):p==="live_set view"?-1:p.startsWith("id ")?Number(p.slice(3)):resolve(p);
  observers.push(this);
 }
 Object.defineProperties(LiveAPI.prototype,{
  id:{get(){return this._id===-1||db.has(this._id)?String(this._id):"0";},set(v){this._id=Number(v);}},
  type:{get(){return db.get(this._id)?.type||"";}},
  unquotedpath:{get(){return objectPath(this._id);}},path:{get(){return '"'+objectPath(this._id)+'"';}},
  property:{get(){return this._property;},set(p){this._property=p;if(p==="selected_parameter"&&this.callback)this.callback([p,"id",selected]);}}
 });
 LiveAPI.prototype.get=function(key){
  apiCalls++;if(this._id===-1&&key==="selected_parameter")return["id",selected];
  const obj=db.get(this._id);if(!obj)throw Error("invalid object");
  if(key==="canonical_parent")return["id",obj[key]];
  if(!(key in obj))throw Error("unknown property "+key);
  if(Array.isArray(obj[key]))return refs(obj[key]);return[obj[key]];
 };
 LiveAPI.prototype.call=function(name,value){
  apiCalls++;assert.equal(name,"str_for_value");
  const target=db.get(this._id);
  if(target.display==="logHz")return[(.01*Math.pow(2000,value)).toFixed(3)+" Hz"];
  if(target.unit)return[value.toFixed(3)+" "+target.unit];
  if(db.get(this._id).name==="Volume")return[value===0?"-inf dB":(6+36*Math.log10(value)).toFixed(2)+" dB"];
  return[value.toFixed(3)+" ms"];
 };
 function Task(fn,owner){this.fn=fn;this.owner=owner;this.scheduled=false;tasks.push(this);}
 Task.prototype.schedule=function(ms){counters.schedules++;assert(Number.isFinite(ms)&&ms>=0);this.ms=ms;this.scheduled=true;};
 Task.prototype.cancel=function(){counters.cancels++;this.scheduled=false;};
 Task.prototype.fire=function(){assert(this.scheduled);this.scheduled=false;this.fn.call(this.owner);};
 const FakeDate=function(){this.getTime=()=>{counters.clockReads++;return time;};};
 const ctx={Task,LiveAPI,Date:FakeDate,console,patcher:{getnamed(name){counters.lookups++;if(!objects.has(name))objects.set(name,{messages:[],message(...a){counters.uiMessages++;this.messages.push(a);}});return objects.get(name);}},
  outlet(n,args){events.push([n,JSON.parse(JSON.stringify(args))]);},notifyclients(){notifications++;},embedmessage(){}};
 ctx.include=function(name){vm.runInContext(fs.readFileSync(path.join(legacy?path.join(__dirname,"fixtures","v41"):path.join(__dirname,"../src"),name),"utf8"),ctx,{filename:name});};
 vm.createContext(ctx);vm.runInContext(legacy?fs.readFileSync(path.join(__dirname,"fixtures","v41","rm16_v41_mapping.js"),"utf8"):source,ctx,{filename:legacy?"v4.1":"V3"});
 let seedSerial=0;ctx.newSeed=function(j){return 1000003+base*104729+(++seedSerial)*15485863+j*32452843;};
 return{ctx,db,events,objects,tasks,id,objectPath,counters,observers,get apiCalls(){return apiCalls;},get notifications(){return notifications;},
  advance(ms){time+=ms;},
  jumpClock(ms){time+=ms;},
  setClock(value){time=value;},
  get time(){return time;},
  fireMotion(){assert(ctx.motionTask.scheduled);time+=ctx.motionTask.ms;ctx.motionTask.fire();},
  initialize(){ctx.init();ctx.initTask.fire();},
  select(n){selected=n;for(const o of observers)if(o._property==="selected_parameter"&&o.callback)o.callback(["selected_parameter","id",n]);},
  map(n,target){ctx.map(n,1);this.select(target);ctx.mapTask.fire();},
  chainChanged(){for(const o of observers)if(o._property==="devices"&&o.callback)o.callback(["devices",...refs(db.get(id(10)).devices)]);},
  rename(n,name){const r=db.get(n);r.name=name;for(const o of observers)if(o._id===n&&o._property==="name"&&o.callback)o.callback(["name",name]);},
  sent(name){return events.filter(([o,m])=>o===0&&m[0]===name).map(x=>x[1][1]);}
 };
}


module.exports={makeHost,source};
