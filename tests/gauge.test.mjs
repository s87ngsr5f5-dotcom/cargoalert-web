import assert from 'node:assert/strict';
import {gaugePosition} from '../dist/gauge.mjs';
let checks=0;const check=f=>{f();checks++;};
for(const [a,r]of [[0,0],[6,36],[-6,36],[15,90],[-15,90],[30,180],[180,180],[-180,180]])check(()=>assert.equal(gaugePosition(a).rotation,r));
check(()=>assert.equal(gaugePosition(-6.5).magnitude,6.5));
check(()=>assert.equal(gaugePosition(31).overflow,true));
check(()=>assert.equal(gaugePosition(30).overflow,false));
for(const a of [null,undefined,NaN,Infinity,'6',181,-181])check(()=>assert.equal(gaugePosition(a),null));
console.log(`gauge: ${checks} checks passed`);
