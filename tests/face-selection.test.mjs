import test from 'node:test';import assert from 'node:assert/strict';
import {triangleIntersectsRectangle} from '../cad-face-selection.js';
const rect={left:0,right:10,top:0,bottom:10},p=(x,y)=>({x,y});
test('face range selects contained faces, edge crossings and faces enclosing the box',()=>{assert.ok(triangleIntersectsRectangle([p(1,1),p(8,1),p(4,9)],rect));assert.ok(triangleIntersectsRectangle([p(-100,-100),p(100,-100),p(0,100)],rect));assert.ok(triangleIntersectsRectangle([p(-5,4),p(15,4),p(15,6)],rect));assert.ok(!triangleIntersectsRectangle([p(20,20),p(30,20),p(25,30)],rect));assert.ok(!triangleIntersectsRectangle([p(8,20),p(20,8),p(20,20)],rect))});
