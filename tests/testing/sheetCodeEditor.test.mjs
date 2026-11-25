import assert from 'node:assert/strict';
import test from 'node:test';
import { flatten, hookHostUrl, sourceUrl } from './sheetEditorModules.mjs';

const hostUrl=hookHostUrl('numbered code editor'),host=await import(hostUrl);
const {default:SheetCodeEditor}=await import(await sourceUrl('src/components/testing/sheet-editor/SheetCodeEditor.tsx',{react:hostUrl}));
test('physical line numbers, selected ranges and scroll synchronization preserve focus and text editing',t=>{
 host.reset();t.after(()=>host.reset());
 const calls=[],field={scrollTop:0,clientHeight:80,matches:()=>false,focus:()=>assert.fail('Selection must not steal focus')},numbers={style:{}},band={style:{}};
 const props={expanded:true,onExpandedChange:value=>calls.push(['expanded',value]),value:'header\n\n'+Array.from({length:20},(_,i)=>`row ${i}`).join('\n'),dirty:false,error:'',range:{startLine:18,endLine:20},linkMissing:false,
 onChange:value=>calls.push(['change',value]),onApply:()=>calls.push(['apply']),onReset:()=>calls.push(['reset'])};
 function render(){host.begin();const nodes=flatten(SheetCodeEditor(props));nodes.find(n=>n.type==='textarea').ref.current=field;
  nodes.find(n=>n.props?.className==='sheet-code-line-list').ref.current=numbers;
  const highlight=nodes.find(n=>n.props?.className==='sheet-code-line-highlight');if(highlight)highlight.ref.current=band;host.flush();return nodes;}
 let nodes=render();assert.equal(nodes.filter(n=>n.props?.['data-line']).length,22);
 assert.equal(nodes.filter(n=>n.type==='span'&&n.props.className==='active').length,3);assert.equal(field.scrollTop,344);
 assert.equal(numbers.style.transform,'translateY(-344px)');assert.equal(band.style.transform,numbers.style.transform);
 const textarea=nodes.find(n=>n.type==='textarea');assert.ok(!textarea.props.readOnly);assert.equal(textarea.props.wrap,'off');
 field.scrollTop=100;textarea.props.onScroll();assert.equal(numbers.style.transform,'translateY(-100px)');assert.equal(band.style.transform,numbers.style.transform);
 textarea.props.onChange({target:{value:'n\ne'}});assert.deepEqual(calls,[['change','n\ne']]);
 props.range={startLine:2,endLine:2};nodes=render();assert.equal(field.scrollTop,20);assert.equal(nodes.find(n=>n.props?.className==='sheet-code-line-highlight').props.style.height,20);
 field.scrollTop=300;props.selectionVersion=1;render();assert.equal(field.scrollTop,20,'reselecting the same note reveals its row');
 field.matches=()=>true;field.scrollTop=140;props.value+='\n';render();assert.equal(field.scrollTop,140,'typing keeps the textarea caret/scroll in control');field.matches=()=>false;
 props.dirty=true;props.error='Wrong MIDI (line 2).';props.range=null;props.linkMissing=true;nodes=render();
 assert.equal(nodes.find(n=>n.type==='textarea').props['aria-invalid'],true);assert.equal(nodes.some(n=>n.props?.className==='sheet-code-line-highlight'),false);
 for(const button of nodes.filter(n=>n.type==='button')){assert.equal(button.props.disabled,false);button.props.onClick();}assert.deepEqual(calls.slice(1),[['apply'],['reset']]);
 assert.ok(nodes.some(n=>n.props?.role==='alert'));assert.ok(nodes.some(n=>n.props?.role==='status'));
});

test('collapsed code stays mounted, preserves caret/scroll, and reveals the current linked line on expansion',t=>{
 host.reset();t.after(()=>host.reset());
 const changes=[],field={scrollTop:140,clientHeight:80,selectionStart:8,selectionEnd:12,matches:()=>false},numbers={style:{}},band={style:{}};
 const props={expanded:false,onExpandedChange:value=>changes.push(value),value:Array.from({length:24},(_,i)=>'line '+i).join('\n'),dirty:true,error:'',range:{startLine:18,endLine:18},linkMissing:false,onChange(){},onApply(){},onReset(){}};
 function render(){host.begin();const nodes=flatten(SheetCodeEditor(props));nodes.find(node=>node.type==='textarea').ref.current=field;nodes.find(node=>node.props?.className==='sheet-code-line-list').ref.current=numbers;nodes.find(node=>node.props?.className==='sheet-code-line-highlight').ref.current=band;host.flush();return nodes;}
 let nodes=render();assert.equal(nodes.find(node=>node.type==='details').props.open,false);assert.equal(field.scrollTop,140);assert.equal(field.selectionStart,8);assert.equal(field.selectionEnd,12);
 const value=nodes.find(node=>node.type==='textarea').props.value;
 nodes.find(node=>node.type==='details').props.onToggle({currentTarget:{open:true}});assert.deepEqual(changes,[true]);
 props.expanded=true;nodes=render();assert.equal(field.scrollTop,304);assert.equal(numbers.style.transform,'translateY(-304px)');assert.equal(nodes.find(node=>node.type==='textarea').props.value,value);
 nodes.find(node=>node.type==='details').props.onToggle({currentTarget:{open:true}});assert.deepEqual(changes,[true],'controlled toggle notifications do not loop');
 props.expanded=false;props.range={startLine:2,endLine:2};render();assert.equal(field.scrollTop,304);assert.equal(field.selectionStart,8);assert.equal(field.selectionEnd,12);
 props.expanded=true;render();assert.equal(field.scrollTop,20);
});
