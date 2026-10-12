import test from 'node:test';
import assert from 'node:assert/strict';
import { runIdempotentQuantityMutation } from '../src/quantityMutation.js';

test('lost response is confirmed by refresh and clears the retained key', async () => {
  const keys=new Map(); let created=0;
  const result=await runIdempotentQuantityMutation({pendingKeys:keys,identity:'a|1|2',attendanceId:'a',expectedQuantity:1,targetQuantity:2,createKey:()=>`key-${++created}`,mutate:async()=>{throw new Error('network')},refresh:async()=>({freshAttn:[{id:'a',quantity:2}]})});
  assert.equal(result.status,'confirmed_by_refresh'); assert.equal(created,1); assert.equal(keys.size,0);
});

test('failed refresh retains the key and the safe retry reuses it', async () => {
  const keys=new Map(); const used=[]; let created=0;
  const args={pendingKeys:keys,identity:'a|1|2',attendanceId:'a',expectedQuantity:1,targetQuantity:2,createKey:()=>`key-${++created}`};
  const uncertain=await runIdempotentQuantityMutation({...args,mutate:async(key)=>{used.push(key);throw new Error('lost')},refresh:async()=>{throw new Error('offline')}});
  assert.equal(uncertain.status,'uncertain'); assert.equal(keys.get(args.identity),'key-1');
  const retried=await runIdempotentQuantityMutation({...args,mutate:async(key)=>{used.push(key);return {id:'a',quantity:2}},refresh:async()=>[]});
  assert.equal(retried.status,'committed'); assert.deepEqual(used,['key-1','key-1']); assert.equal(created,1); assert.equal(keys.size,0);
});

test('successful refresh confirming unchanged state permits a fresh later mutation', async () => {
  const keys=new Map(); let created=0;
  const args={pendingKeys:keys,identity:'a|1|2',attendanceId:'a',expectedQuantity:1,targetQuantity:2,createKey:()=>`key-${++created}`};
  const rejected=await runIdempotentQuantityMutation({...args,mutate:async()=>{throw new Error('capacity')},refresh:async()=>[{id:'a',quantity:1}]});
  assert.equal(rejected.status,'rejected_confirmed'); assert.equal(keys.size,0);
  await runIdempotentQuantityMutation({...args,mutate:async()=>({id:'a',quantity:2}),refresh:async()=>[]});
  assert.equal(created,2);
});
