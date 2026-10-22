/* Counts operations in the simulated controller. No Max/Live CPU claim. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {makeHost,targets}=require('../tests/host.cjs');
const callbacks=20000;
function measure(legacy,active){
  const h=makeHost(0,0,legacy,legacy==='v31'&&active===24?24:undefined);h.initialize();
  targets.slice(0,active).forEach((id,j)=>h.map(j+1,id));
  h.events.length=0;
  let reads=0,commands=0;const packets=new Set();
  h.ctx.lanes=new Proxy(h.ctx.lanes,{get(target,key){
    if(typeof key==='string'&&/^\d+$/.test(key))reads++;
    return Reflect.get(target,key);
  }});
  h.ctx.outlet=(out,args)=>{if(out===0){commands++;packets.add(args);}};
  const before={...h.counters},api=h.apiCalls;
  for(let k=0;k<callbacks;k++)h.fireMotion();
  const counts={};for(const key of Object.keys(before))counts[key]=h.counters[key]-before[key];
  return{active_slots:active,callbacks,native_value_commands:commands,distinct_value_packet_arrays:packets.size,slot_array_reads:reads,
    api_calls:h.apiCalls-api,...counts};
}
const report={
  scope:'Counts in a Node.js mock host, not native CPU/DSP/memory measurement. Proxy instrumentation is test-only.',
  controller_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/rm16_v3_mapping.js'))).digest('hex'),
  comparisons:[1,4,16].map(active=>{
    const baseline=measure(true,active),v3=measure(false,active);
    assert.equal(baseline.native_value_commands,v3.native_value_commands);
    assert.equal(v3.api_calls,0);assert.equal(v3.cancels,0);assert.equal(v3.uiMessages,0);
    return{active,baseline,v3};
  }),
  v31_comparisons:[1,4,16,24].map(active=>{
    const baseline=measure('v31',active),v32=measure(false,active);
    assert.equal(baseline.native_value_commands,v32.native_value_commands);
    assert.equal(v32.api_calls,0);assert.equal(v32.uiMessages,0);
    assert.equal(v32.distinct_value_packet_arrays,active);
    return{active,baseline_note:active===24?'V3.1 algorithm with only COUNT extended to 24':'Unchanged released V3.1 controller',
      baseline,v32};
  }),
};
const directory=path.join(__dirname,'../reports');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'control-operations.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
