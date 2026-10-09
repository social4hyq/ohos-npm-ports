// @test-package: @resvg/resvg-js
const assert=require('node:assert/strict'),{Resvg}=require('@resvg/resvg-js');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#ff0000"/></svg>',rendered=new Resvg(svg).render(),png=rendered.asPng();
assert.equal(rendered.width,20);assert.equal(rendered.height,10);assert.deepEqual([...png.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
