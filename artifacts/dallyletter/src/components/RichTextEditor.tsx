import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Type, List, AlignLeft, AlignCenter, AlignRight, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

const allowedTags=new Set(["B","STRONG","I","EM","U","SPAN","P","BR","UL","OL","LI","DIV"]);
export function sanitizeRichText(html:string){
  if(typeof DOMParser==="undefined") return html.replace(/<[^>]+>/g,"");
  const doc=new DOMParser().parseFromString(html,"text/html");
  const walk=(node:Node)=>{
    node.childNodes.forEach(child=>{
      if(child.nodeType===1){
        const el=child as HTMLElement;
        if(!allowedTags.has(el.tagName)){const text=document.createTextNode(el.textContent||"");el.replaceWith(text);return;}
        [...el.attributes].forEach(a=>{if(a.name!=="style")el.removeAttribute(a.name);});
        if(el.hasAttribute("style")){
          const safe=[...el.style].filter(k=>["font-size","font-family","text-align","font-weight","font-style","text-decoration"].includes(k));
          const styles=safe.map(k=>`${k}:${el.style.getPropertyValue(k)}`).join(";");
          if(styles)el.setAttribute("style",styles);else el.removeAttribute("style");
        }
      }
      walk(child);
    });
  };
  walk(doc.body);return doc.body.innerHTML;
}
export function RichTextEditor({value,onChange,placeholder="Write here…",className=""}:{value:string;onChange:(value:string)=>void;placeholder?:string;className?:string}){
 const ref=useRef<HTMLDivElement>(null);
 const lastValue=useRef(value);
 useEffect(()=>{ lastValue.current=value; },[value]);
 useEffect(()=>{ const el=ref.current; if(!el) return; if(document.activeElement!==el && el.innerHTML!==sanitizeRichText(value)) el.innerHTML=sanitizeRichText(value); },[value]);
 const command=(name:string,arg?:string)=>{ref.current?.focus();document.execCommand(name,false,arg);onChange(sanitizeRichText(ref.current?.innerHTML||""));};
 const size=(v:string)=>command("fontSize",v);
 const family=(v:string)=>command("fontName",v);
 return <div className={`overflow-hidden rounded-xl border bg-background ${className}`}>
  <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-1.5">
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Bold" onClick={()=>command("bold")}><Bold className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Italic" onClick={()=>command("italic")}><Italic className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Underline" onClick={()=>command("underline")}><Underline className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Handwriting" onClick={()=>family("cursive")}><PenLine className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Normal text" onClick={()=>size("3")}><Type className="h-4 w-4"/></Button>
   <Button type="button" size="sm" variant="ghost" onClick={()=>size("5")}>Large</Button>
   <Button type="button" size="sm" variant="ghost" onClick={()=>size("7")}>Huge</Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Bullets" onClick={()=>command("insertUnorderedList")}><List className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Align left" onClick={()=>command("justifyLeft")}><AlignLeft className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Center" onClick={()=>command("justifyCenter")}><AlignCenter className="h-4 w-4"/></Button>
   <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Align right" onClick={()=>command("justifyRight")}><AlignRight className="h-4 w-4"/></Button>
  </div>
  <div ref={ref} contentEditable suppressContentEditableWarning onInput={()=>{ const html=sanitizeRichText(ref.current?.innerHTML||""); lastValue.current=html; onChange(html); }} dangerouslySetInnerHTML={{__html:sanitizeRichText(value)}} data-placeholder={placeholder} dir="ltr" style={{ direction: "ltr", unicodeBidi: "plaintext" }} className="min-h-24 p-3 text-sm outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]" />
 </div>;
}
