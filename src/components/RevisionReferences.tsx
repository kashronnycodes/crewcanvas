import {useEffect,useRef,useState} from "react";
import type {Project,Revision,WorkspaceFile,WorkspaceSnapshot} from "../../shared/types";
import {validateFile} from "../../shared/workspace";
import {files} from "../fileService";
import Modal from "./Modal";
import {FilePreview} from "./WorkspaceFiles";

type Selection={id:string;file:File;url:string;saved?:WorkspaceFile;progress?:number;error?:string};
export function useReferenceImages(projectId:string){
  const [entries,setEntries]=useState<Selection[]>([]),[uploading,setUploading]=useState(false),[error,setError]=useState("");
  const current=useRef(entries);
  const update=(next:Selection[])=>{current.current=next;setEntries(next);};
  useEffect(()=>()=>current.current.forEach(e=>URL.revokeObjectURL(e.url)),[]);
  function choose(chosen:File[]){
    setError("");const next=[...current.current];
    for(const file of chosen)try{
      const mime=validateFile(file);
      if(!["image/png","image/jpeg","image/webp","image/gif"].includes(mime))throw Error("Choose PNG, JPG, WebP or GIF images.");
      if(next.some(e=>e.file.name===file.name&&e.file.size===file.size&&e.file.lastModified===file.lastModified))continue;
      if(next.length>=10)throw Error("Choose up to 10 reference images.");
      next.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)});
    }catch(err){setError((err as Error).message);}
    update(next);
  }
  function clear(){current.current.forEach(e=>URL.revokeObjectURL(e.url));update([]);setError("");}
  async function remove(id:string){const entry=current.current.find(e=>e.id===id);if(!entry||uploading)return;try{if(entry.saved)await files.update(entry.saved,{remove:true});URL.revokeObjectURL(entry.url);update(current.current.filter(e=>e.id!==id));}catch(err){setError((err as Error).message);}}
  async function upload(){
    setUploading(true);setError("");
    const patch=(id:string,values:Partial<Selection>)=>update(current.current.map(e=>e.id===id?{...e,...values}:e));
    try{
      for(const entry of current.current){if(entry.saved)continue;patch(entry.id,{progress:0,error:""});try{
        const saved=await files.upload(entry.file,{projectId,purpose:"revision_reference",x:0,y:0},n=>patch(entry.id,{progress:n}));
        patch(entry.id,{saved,progress:100});
      }catch(err){patch(entry.id,{error:(err as Error).message});throw err;}}
      return current.current.map(e=>({fileId:e.saved!.id,version:e.saved!.versions.length-1}));
    }finally{setUploading(false);}
  }
  return{entries,uploading,error,choose,clear,remove,upload};
}
export function ReferenceImagePicker({images,disabled}:{images:ReturnType<typeof useReferenceImages>;disabled:boolean}){
  const input=useRef<HTMLInputElement>(null),[preview,setPreview]=useState<Selection|null>(null),[dragging,setDragging]=useState(false);
  return <section className="revision-reference-images" aria-label="Revision reference images">
    <h4>Revision reference images</h4><p className="fine-print">Visual feedback for this revision, separate from submitted work.</p>
    <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Choose revision reference images" disabled={disabled} onChange={e=>{images.choose(Array.from(e.target.files??[]));e.target.value="";}}/>
    <button type="button" className={`reference-dropzone ${dragging?"is-dragging":""}`} disabled={disabled} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!disabled)images.choose(Array.from(e.dataTransfer.files));}}>Drop reference images here or choose files<small>PNG, JPG, WebP or GIF · up to 10 images · 25 MB each</small></button>
    <div className="reference-image-grid">{images.entries.map(entry=><article key={entry.id}>
      <button type="button" className="reference-thumbnail" onClick={()=>setPreview(entry)}><img src={entry.url} alt={`Preview ${entry.file.name}`}/></button><span>{entry.file.name}</span>
      {entry.progress!==undefined&&<><progress max={100} value={entry.progress} aria-label={`Upload ${entry.file.name}`}/><small>{entry.progress===100?"Uploaded privately":`Uploading ${entry.progress}%`}</small></>}
      {entry.error&&<p role="alert" className="error-message">{entry.error}</p>}
      <button type="button" className="text-button" aria-label={`Remove reference ${entry.file.name}`} disabled={disabled} onClick={()=>void images.remove(entry.id)}>Remove</button>
    </article>)}</div>
    {images.error&&<p role="alert" className="error-message">{images.error}</p>}
    {preview&&<Modal title={preview.file.name} onClose={()=>setPreview(null)} wide><img className="reference-large-preview" src={preview.url} alt={preview.file.name}/></Modal>}
  </section>;
}
export function RevisionReferenceGallery({snapshot,project,revision}:{snapshot:WorkspaceSnapshot;project:Project;revision:Revision}){
  const [preview,setPreview]=useState<{file:WorkspaceFile;version:number}|null>(null);
  if(!revision.references?.length)return null;
  return <section className="revision-reference-images" aria-label="Saved revision reference images"><h4>Revision reference images</h4>
    <div className="reference-image-grid">{revision.references.map(ref=>{const file=snapshot.files?.find(f=>f.id===ref.fileId&&f.projectId===project.id);return file?<button type="button" key={ref.fileId} className="reference-thumbnail" onClick={()=>setPreview({file,version:ref.version})}><FilePreview file={file} version={ref.version} thumbnail/><span>{file.name}</span></button>:<p key={ref.fileId}>Reference image unavailable.</p>;})}</div>
    {preview&&<Modal title={preview.file.name} onClose={()=>setPreview(null)} wide><div className="file-large-preview"><FilePreview file={preview.file} version={preview.version} full/></div></Modal>}
  </section>;
}
