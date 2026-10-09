// @test-package: @tailwindcss/oxide
const assert=require('node:assert/strict'),{Scanner}=require('@tailwindcss/oxide'),scanner=new Scanner({sources:[]});
const candidates=scanner.scanFiles([{content:'<div class="text-red-500 flex"></div>',extension:'html'}]);assert.ok(candidates.includes('text-red-500'),JSON.stringify(candidates));assert.ok(candidates.includes('flex'),JSON.stringify(candidates));
