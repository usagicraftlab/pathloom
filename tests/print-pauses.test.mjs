import test from 'node:test';import assert from 'node:assert/strict';
import {validatePauseLayers,pauseGcode} from '../gcode-metadata.js';
test('pause layers are unique positive indices, bounded and sorted without mutation',()=>{const layers=[5,2];assert.deepEqual(validatePauseLayers(layers,10),[2,5]);assert.deepEqual(layers,[5,2]);for(const invalid of [[0],[-1],[1.5],[2,2],[Infinity],['2']])assert.throws(()=>validatePauseLayers(invalid));assert.throws(()=>validatePauseLayers([11],10));assert.deepEqual(validatePauseLayers(),[])});
test('Prusa pause emits M601 only at explicitly marked layer boundaries',()=>{assert.deepEqual(pauseGcode(2,[2,5]),[';PAUSE_PRINT','M601 ; Pause before layer 2']);assert.deepEqual(pauseGcode(1,[2,5]),[]);assert.deepEqual(pauseGcode(2),[])});
