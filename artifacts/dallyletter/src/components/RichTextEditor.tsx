import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Type, List, AlignLeft, AlignCenter, AlignRight, PenLine, Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const allowedTags=new Set(["B","STRONG","I","EM","U","SPAN","P","BR","UL","OL","LI","DIV"]);
const safeStyleNames=["font-size","font-family","text-align","font-weight","font-style","text-decoration","color","text-shadow"];

export function sanitizeRichText(html:string){
  if(typeof DOMParser==="undefined") return html.replace(/<[^>]+>/g,"");
  const doc=new DOMParser().parseFromString(html,"text/html");
  const walk=(node:Node)=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===1){
        const el=child as HTMLElement;
        if(!allowedTags.has(el.tagName)){
          const text=document.createTextNode(el.textContent||"");
          el.replaceWith(text);
          return;
        }
        [...el.attributes].forEach(a=>{if(a.name!=="style")el.removeAttribute(a.name);});
        if(el.hasAttribute("style")){
          const styles=[...el.style].filter(k=>safeStyleNames.includes(k))
            .map(k=>`${k}:${el.style.getPropertyValue(k)}`).join(";");
          if(styles)el.setAttribute("style",styles);else el.removeAttribute("style");
        }
      }
      walk(child);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

type Props={value:string;onChange:(value:string)=>void;placeholder?:string;className?:string};

export function RichTextEditor({value,onChange,placeholder="Write here…",className=""}:Props){
 const ref=useRef<HTMLDivElement>(null);
 const savedSelection=useRef<Range|null>(null);
 const internalChange=useRef(false);
 const [fontSizeChoice,setFontSizeChoice]=useState("");
 const [fontNameChoice,setFontNameChoice]=useState("");

 const saveSelection=()=>{
   const el=ref.current,selection=window.getSelection();
   if(!el||!selection||selection.rangeCount===0)return;
   const range=selection.getRangeAt(0);
   if(el.contains(range.commonAncestorContainer)) savedSelection.current=range.cloneRange();
 };
 const restoreSelection=()=>{
   const el=ref.current,range=savedSelection.current;
   if(!el||!range)return;
   el.focus();
   const selection=window.getSelection();
   if(!selection)return;
   selection.removeAllRanges();
   selection.addRange(range);
 };

 useEffect(()=>{
   const el=ref.current;
   if(!el||internalChange.current)return;
   const next=sanitizeRichText(value);
   if(el.innerHTML!==next)el.innerHTML=next;
 },[value]);

 useEffect(()=>{
   const handler=()=>saveSelection();
   document.addEventListener("selectionchange",handler);
   return()=>document.removeEventListener("selectionchange",handler);
 });

 const emit=()=>{internalChange.current=true;const html=sanitizeRichText(ref.current?.innerHTML||"");onChange(html);queueMicrotask(()=>{internalChange.current=false;saveSelection();});};

 const command=(name:string,arg?:string)=>{
   restoreSelection();
   try{document.execCommand("styleWithCSS",false,"true");}catch{}
   try{document.execCommand(name,false,arg);}catch{}
   emit();
   saveSelection();
 };

 const formatButton=(name:string,arg?:string,title?:string,icon?:React.ReactNode)=><Button
   type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" title={title}
   onMouseDown={e=>{e.preventDefault();saveSelection();}} onClick={()=>command(name,arg)}
 >{icon}</Button>;

 const fontSize=(v:string)=>{setFontSizeChoice(v);command("fontSize",v);};
 const fontName=(v:string)=>{setFontNameChoice(v);command("fontName",v);};
 const color=(v:string)=>command("foreColor",v);

 return <div className={`overflow-hidden rounded-xl border bg-background shadow-sm ${className}`}>
  <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1.5">
   {formatButton("bold",undefined,"Bold",<Bold className="h-4 w-4"/>)} 
   {formatButton("italic",undefined,"Italic",<Italic className="h-4 w-4"/>)} 
   {formatButton("underline",undefined,"Underline",<Underline className="h-4 w-4"/>)} 
   {formatButton("fontName","cursive","Handwriting",<PenLine className="h-4 w-4"/>)} 
   <label className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted" title="Text colour">
    <Palette className="h-4 w-4"/><input aria-label="Text colour" type="color" defaultValue="#0A1931" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onMouseDown={()=>saveSelection()} onChange={e=>color(e.target.value)}/>
   </label>
   <label className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted" title="Word art colour">
    <Sparkles className="h-4 w-4"/><input aria-label="Word art colour" type="color" defaultValue="#D4AF37" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onMouseDown={()=>saveSelection()} onChange={e=>{restoreSelection();try{document.execCommand("styleWithCSS",false,"true");}catch{};try{document.execCommand("foreColor",false,e.target.value);document.execCommand("bold",false,"true");}catch{};const selection=window.getSelection();if(selection&&selection.rangeCount){const span=document.createElement("span");span.style.textShadow="1px 1px 0 rgba(0,0,0,.12)";try{selection.getRangeAt(0).surroundContents(span);}catch{};}emit();saveSelection();}}/>
   </label>
   <select aria-label="Text size" value={fontSizeChoice} className="h-8 min-w-[92px] rounded-md border border-[#D4AF37]/50 bg-[#0A1931] px-2 text-xs font-semibold text-[#FFF8E1]" onMouseDown={()=>saveSelection()} onChange={e=>{if(e.target.value)fontSize(e.target.value);}}>
    <option value="">T • Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="7">Huge</option>
   </select>
   <select aria-label="Font style" value={fontNameChoice} className="h-8 min-w-[92px] rounded-md border border-[#D4AF37]/50 bg-[#0A1931] px-2 text-xs font-semibold text-[#FFF8E1]" onMouseDown={()=>saveSelection()} onChange={e=>{if(e.target.value)fontName(e.target.value);}}>
    <option value="">Font</option><option value="Arial">Sans</option><option value="Georgia">Serif</option><option value="monospace">Mono</option><option value="cursive">Handwriting</option><option value="Impact">Word Art</option>
   </select>
   {formatButton("insertUnorderedList",undefined,"Bullets",<List className="h-4 w-4"/>)} 
   {formatButton("justifyLeft",undefined,"Align left",<AlignLeft className="h-4 w-4"/>)} 
   {formatButton("justifyCenter",undefined,"Center",<AlignCenter className="h-4 w-4"/>)} 
   {formatButton("justifyRight",undefined,"Align right",<AlignRight className="h-4 w-4"/>)} 
  </div>
  <div ref={ref} contentEditable suppressContentEditableWarning dir="ltr" spellCheck className="min-h-24 p-3 text-sm leading-6 outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]" data-placeholder={placeholder}
    onInput={emit} onKeyUp={saveSelection} onMouseUp={saveSelection} onFocus={saveSelection}
    style={{direction:"ltr",unicodeBidi:"plaintext",writingMode:"horizontal-tb",textAlign:"left",caretColor:"#FFC72C"}}
  />
 </div>;
}
