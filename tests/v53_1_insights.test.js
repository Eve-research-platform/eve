'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const appPath=path.join(__dirname,'..','app','app.js');
const src=fs.readFileSync(appPath,'utf8');
const {normaliseInsightTags,repositoryFindingHaystack}=require('../app/app.js');

assert.deepEqual(normaliseInsightTags('Navigation, Trust, navigation\n#Onboarding'),['Navigation','Trust','Onboarding']);
assert.deepEqual(normaliseInsightTags(['  Mental model  ','Findability','mental model']),['Mental model','Findability']);
assert.equal(normaliseInsightTags(Array.from({length:20},(_,i)=>`tag ${i}`)).length,12);

const haystack=repositoryFindingHaystack({
  title:'Recovery is hard to find',
  summary:'People looked under profile first',
  evidence:'Three participants said they expected it in account settings',
  tags:['Navigation','Account']
});
assert(haystack.includes('recovery is hard to find'));
assert(haystack.includes('navigation'));
assert(haystack.includes('three participants'));

assert(!src.includes("return toast('Choose an image smaller than 12 MB'"));
assert(src.includes("Large image · Eve will optimise it locally"));
assert(src.includes('function bindReviewInsightCapture()'));
assert(src.includes("button.textContent='＋ Save insight'"));
assert(src.includes('function saveInsightEditor()'));
assert(src.includes('function filterRepositoryCards()'));
assert(src.includes('data-repository-search'));
assert(src.includes('Open source →'));
assert(src.includes('editInsight('));
assert(src.includes('deleteInsight('));

console.log('v53.1 insight bank tests passed');
