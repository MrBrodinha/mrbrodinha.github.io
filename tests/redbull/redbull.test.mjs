import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../../src/components/redbull/redbullData.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {normalizedUrl,validateImage,validateNewDrink,MAX_IMAGE_BYTES,redbullError,readDrink,normalizeRating,RATING_VALUES}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const draft={name:'  Summer Edition  ',flavour:'  Citrus  ',sourceUrl:'https://example.com/drink',imageUrl:'https://example.com/image.png',rating:4,opinion:' Great! '};

test('new drink validation preserves useful information and requires a first rating',()=>{
  assert.deepEqual(validateNewDrink(draft),{name:'Summer Edition',flavour:'Citrus',sourceUrl:draft.sourceUrl,imageUrl:draft.imageUrl,rating:4,opinion:'Great!'});
  for(const invalid of [{rating:''},{rating:-1},{rating:11},{rating:1.5},{name:' '},{name:'x'.repeat(161)},{flavour:''},{flavour:'   '},{flavour:'x'.repeat(201)},{opinion:'x'.repeat(2001)}])assert.throws(()=>validateNewDrink({...draft,...invalid}));
  assert.equal(validateNewDrink({...draft,imageUrl:'',sourceUrl:''}).imageUrl,null);
});
test('source/image URLs reject executable protocols, credentials, whitespace and oversize values',()=>{
  for(const invalid of ['javascript:alert(1)','data:image/svg+xml;base64,abc','file:///etc/passwd','https://alice:private@example.test/img','https://example.test/with a space','https://example.test/'+'x'.repeat(2048)])assert.throws(()=>normalizedUrl(invalid));
  assert.throws(()=>normalizedUrl('http://example.test/image.png',true));
  assert.equal(normalizedUrl('http://example.test/drink'),'http://example.test/drink');
  assert.equal(normalizedUrl('   '),null);
});
test('uploads accept bounded raster images and reject unsupported and empty files',()=>{
  for(const type of ['image/jpeg','image/png','image/webp','image/gif'])assert.doesNotThrow(()=>validateImage({type,size:MAX_IMAGE_BYTES}));
  for(const file of [{type:'image/svg+xml',size:1},{type:'text/html',size:1},{type:'constructor',size:1},{type:'image/png',size:0},{type:'image/png',size:MAX_IMAGE_BYTES+1}])assert.throws(()=>validateImage(file));
});
test('drink records and errors never copy arbitrary backend properties into the UI',()=>{
  const value=readDrink({id:'id',name:'Name',flavour:'Citrus',description:'Description',source_url:null,image_url:null,image_path:'private/image.png',email:'do-not-copy@example.test'});
  assert.deepEqual(value,{id:'id',name:'Name',flavor:'Citrus',url:null,image_url:null,image_path:'private/image.png'});
  assert.doesNotMatch(redbullError({message:'do-not-copy@example.test password=secret'}),/do-not-copy|secret/);
  assert.match(redbullError({code:'42501'}),/access/);
  assert.match(redbullError({message:'redbull_duplicate_source'}),/source link/);
  assert.match(redbullError({message:'redbull_flavour_required'}),/flavour/);
  assert.match(redbullError({code:'23514',message:'new row violates check constraint "redbull_rating_rating_check"'}),/0–10/);
  assert.match(redbullError({code:'23502',message:'private@example.test password=secret'}),/Reference: 23502/);
  assert.doesNotMatch(redbullError({code:'23502',message:'private@example.test password=secret'}),/private@example|secret/);
  assert.doesNotMatch(redbullError({code:'private@example.test',message:'secret'}),/private@example|secret/);
  for(const message of ['__proto__','constructor','toString']) assert.equal(typeof redbullError({message}),'string');
});

test('stored catalog URLs are validated before rendering links and images',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd','https://user:password@example.test/image']) {
    const drink=readDrink({id:'id',name:'Name',flavour:'Citrus',source_url:url,image_url:url,image_path:null});
    assert.equal(drink.url,null);assert.equal(drink.image_url,null);
  }
  const drink=readDrink({id:'id',name:'Name',flavour:'Citrus',source_url:'http://example.test/drink',image_url:'https://example.test/image.png',image_path:null});
  assert.equal(drink.url,'http://example.test/drink');assert.equal(drink.image_url,'https://example.test/image.png');
});

test('zero and ten are scores, while an empty selection stays empty',()=>{
  assert.deepEqual(RATING_VALUES,Array.from({length:11},(_,index)=>index));
  for(const rating of [0,10]) {
    const value=validateNewDrink({...draft,rating,sourceUrl:'  '});
    assert.equal(value.rating,rating);assert.equal(value.sourceUrl,null);
    assert.equal(normalizeRating(rating),rating);
  }
  assert.equal(normalizeRating('0'),0);
  for(const empty of ['', ' ', null, undefined, false, [], NaN, -1, 11])assert.equal(normalizeRating(empty),'');
});
