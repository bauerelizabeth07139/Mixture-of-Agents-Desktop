import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";

interface FileEntry { name: string; path: string; isDir: boolean; size?: number; children?: FileEntry[]; }
interface FileManagerProps { onFileRun?: (filePath: string, result: any) => void; }

const LANG: Record<string,string> = { py:"python",js:"javascript",ts:"typescript",html:"html",css:"css",json:"json",md:"markdown",c:"c",cpp:"cpp",go:"go",rs:"rust",java:"java",rb:"ruby",php:"php",sh:"shell" };
const ICON: Record<string,string> = { py:"🐍",js:"⚡",ts:"🔧",html:"🌐",css:"🎨",json:"📋",md:"📝",c:"⚙️",cpp:"⚙️",go:"🚀",rs:"🧪",java:"☕",rb:"💎",sh:"💻" };
const fmtSize = (b: number) => b < 1024 ? b+" B" : b < 1048576 ? (b/1024).toFixed(1)+" KB" : (b/1048576).toFixed(1)+" MB";
const extOf = (n: string) => (n.split(".").pop()||"").toLowerCase();
const FILE_TEMPLATES: Record<string, {ext:string,label:string,icon:string,content:string}> = {
  "py":     {ext:".py",     label:"Python",   icon:"\ud83d\udc0d", content:'print("Hello, World!")\n'},
  "js":     {ext:".js",     label:"JavaScript",icon:"\u26a1",       content:'console.log("Hello, World!");\n'},
  "ts":     {ext:".ts",     label:"TypeScript",icon:"\ud83d\udd27", content:'const msg: string = "Hello, World!";\nconsole.log(msg);\n'},
  "html":   {ext:".html",   label:"HTML",      icon:"\ud83c\udf10", content:'<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body><h1>Hello</h1></body>\n</html>\n'},
  "css":    {ext:".css",    label:"CSS",       icon:"\ud83c\udfa8", content:'body {\n  margin: 0;\n  font-family: sans-serif;\n}\n'},
  "json":   {ext:".json",   label:"JSON",      icon:"\ud83d\udccb", content:'{\n  "name": "project"\n}\n'},
  "md":     {ext:".md",     label:"Markdown",  icon:"\ud83d\udcdd", content:'# Title\n\nHello World\n'},
  "c":      {ext:".c",      label:"C",         icon:"\u2699\ufe0f", content:'#include <stdio.h>\n\nint main() {\n  printf("Hello, World!\\n");\n  return 0;\n}\n'},
  "cpp":    {ext:".cpp",    label:"C++",       icon:"\u2699\ufe0f", content:'#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}\n'},
  "go":     {ext:".go",     label:"Go",        icon:"\ud83d\ude80", content:'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, World!")\n}\n'},
  "rs":     {ext:".rs",     label:"Rust",      icon:"\ud83e\uddea", content:'fn main() {\n  println!("Hello, World!");\n}\n'},
  "java":   {ext:".java",   label:"Java",      icon:"\u2615",       content:'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}\n'},
  "rb":     {ext:".rb",     label:"Ruby",      icon:"\ud83d\udc8e", content:'puts "Hello, World!"\n'},
  "sh":     {ext:".sh",     label:"Shell",     icon:"\ud83d\udcbb", content:'#!/bin/bash\necho "Hello, World!"\n'},
};


export function FileManager({ onFileRun }: FileManagerProps) {
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("moa-workspace") || "");
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([localStorage.getItem("moa-workspace") || ""]));
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [ctxMenu, setCtxMenu] = useState<{x:number;y:number;path:string;isDir:boolean;name:string}|null>(null);
  const [newItem, setNewItem] = useState<{parentPath:string;isDir:boolean}|null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string|null>(null);
  const [renameName, setRenameName] = useState("");
  const [showWelcome, setShowWelcome] = useState(!localStorage.getItem("moa-workspace"));
  const templateClickedRef = useRef(false);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("moa-recent") || "[]"); } catch { return []; } });
  const [browseVis, setBrowseVis] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [browseEntries, setBrowseEntries] = useState<any[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [projName, setProjName] = useState("");
  const [browseMode, setBrowseMode] = useState<"open"|"create">("open");


  useEffect(() => { if (workspace) { localStorage.setItem("moa-workspace", workspace); setRecent(prev => { const n = [workspace, ...prev.filter(p=>p!==workspace)].slice(0,10); localStorage.setItem("moa-recent", JSON.stringify(n)); return n; }); } }, [workspace]);
  const loadTree = useCallback(async () => { if (!workspace) return; const r = await api.listTree(workspace, 4); if (r.tree) setTree(r.tree); }, [workspace]);
  useEffect(() => { loadTree(); }, [loadTree]);
  useEffect(() => { const h = () => setCtxMenu(null); if (ctxMenu) { document.addEventListener("click", h); return () => document.removeEventListener("click", h); } }, [ctxMenu]);

  const openBrowser = async (mode: "open"|"create") => { setBrowseMode(mode); setBrowseVis(true); setBrowseLoading(true); const r = await api.browseFiles(""); setBrowseEntries(r.entries||[]); setBrowsePath(""); setBrowseLoading(false); };
  const navBrowse = async (p: string) => { setBrowseLoading(true); const r = await api.browseFiles(p); setBrowsePath(r.path||p); setBrowseEntries(r.entries||[]); setBrowseLoading(false); };
  const confirmBrowse = async () => { if (browseMode==="create" && projName.trim()) { const sep = browsePath.includes("/") ? "/" : "\\"; const nd = browsePath + sep + projName.trim(); await api.createFile(nd, "", true); setWorkspace(nd); } else { setWorkspace(browsePath); } setBrowseVis(false); setShowWelcome(false); setTree([]); setSelectedFile(""); };

  const openFile = async (fp: string) => { setSelectedFile(fp); setRunResult(null); setIsEditing(false); setDirty(false); try { const r = await api.readAbsolute(fp); if (r.type==="file") { setFileContent(r.content||""); setEditContent(r.content||""); } } catch {} };
  const saveFile = async () => { if (!selectedFile) return; await api.writeFile(selectedFile, editContent); setFileContent(editContent); setDirty(false); setIsEditing(false); };
  const runFile = async () => { if (!selectedFile||running) return; setRunning(true); setRunResult(null); try { const r = await api.runFile(selectedFile, 60000); setRunResult(r); onFileRun?.(selectedFile, r); } catch(e:any) { setRunResult({success:false,output:e.message,exitCode:1}); } setRunning(false); };
  const createItemWithTemplate = async (tpl: typeof FILE_TEMPLATES[string]) => {
    if (!newItem) return;
    const sep = newItem.parentPath.includes("/") ? "/" : "\\";
    let fileName = newName.trim() || ("file" + tpl.ext);
    if (!fileName.endsWith(tpl.ext)) fileName += tpl.ext;
    await api.createFile(newItem.parentPath + sep + fileName, tpl.content, false);
    setNewItem(null); setNewName("");
    loadTree();
  };
  const createItem = async () => { if (!newItem||!newName.trim()) { setNewItem(null); return; } const sep = newItem.parentPath.includes("/") ? "/" : "\\"; await api.createFile(newItem.parentPath + sep + newName.trim(), "", newItem.isDir); setNewItem(null); setNewName(""); loadTree(); };
  const deleteItem = async (fp: string, nm: string) => { if (!confirm("\u26a0\ufe0f \u786e\u5b9a\u5220\u9664 "+nm+"?")) return; await api.deleteFile(fp); if (selectedFile===fp) { setSelectedFile(""); setFileContent(""); } loadTree(); };
  const renameItem = async (old: string) => { if (!renameName.trim()) { setRenaming(null); return; } const parent = old.replace(/[\\/][^\\/]+$/, ""); const sep = parent.includes("/") ? "/" : "\\"; await api.renameFile(old, parent+sep+renameName.trim()); setRenaming(null); setRenameName(""); loadTree(); };
  const toggleDir = (dp: string) => { setExpanded(p => { const n = new Set(p); if (n.has(dp)) n.delete(dp); else n.add(dp); return n; }); };


  const renderTree = (items: FileEntry[], depth: number): React.ReactNode => items.map(item => {
    const isExp = expanded.has(item.path); const isSel = selectedFile === item.path; const ext = extOf(item.name);
    return (
      <React.Fragment key={item.path}>
        <div className={"fm-item"+(isSel?" sel":"")} style={{paddingLeft:8+depth*16}} onClick={()=>item.isDir?toggleDir(item.path):openFile(item.path)} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,path:item.path,isDir:item.isDir,name:item.name});}}>
          {item.isDir ? <span className={"fm-arrow"+(isExp?" exp":"")}>▶</span> : <span style={{width:14}}/>}
          <span className="fm-icon">{item.isDir?(isExp?"📂":"\ud83d\udcc1"):(ICON[ext]||"\ud83d\udcc4")}</span>
          {renaming===item.path ? <input className="fm-rename" value={renameName} onChange={e=>setRenameName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameItem(item.path);if(e.key==="Escape")setRenaming(null);}} onBlur={()=>renameItem(item.path)} autoFocus onClick={e=>e.stopPropagation()}/> : <span className="fm-name">{item.name}</span>}
          {!item.isDir && item.size!=null && <span className="fm-size">{fmtSize(item.size)}</span>}
        </div>
        {item.isDir && isExp && (<>
          {item.children && renderTree(item.children, depth+1)}
          {newItem?.parentPath===item.path && (
            <div>
              <div style={{padding:2,paddingLeft:8,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:14}}/><span className="fm-icon">{newItem.isDir?"📁":"📄"}</span>
                <input className="fm-rename" value={newName} onChange={e=>setNewName(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")createItem();if(e.key==="Escape"){setNewItem(null);setNewName("");}}}
                  onBlur={()=>{setTimeout(()=>{if(templateClickedRef.current){templateClickedRef.current=false;return;} if(newName.trim())createItem();else{setNewItem(null);setNewName("");}},200);}}
                  autoFocus placeholder={newItem.isDir?"新文件夹...":"文件名 如 main.py"}/>
              </div>
              {!newItem.isDir && <div style={{padding:"2px 8px 6px 26px",display:"flex",flexWrap:"wrap",gap:4}}>
                {Object.values(FILE_TEMPLATES).map(t => (
                  <button key={t.ext} className="fm-tpl-btn" title={t.ext}
                    onClick={()=>{templateClickedRef.current=true; const base=newName.trim(); const nm=base?(base.endsWith(t.ext)?base:base+t.ext):("file"+t.ext); setNewName(nm); setTimeout(()=>createItemWithTemplate(t),50);}}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>}
            </div>
          )}
          {(!item.children||item.children.length===0)&&!newItem?.parentPath&&
            <div style={{paddingLeft:8+(depth+1)*16+18,padding:"2px 8px",fontSize:11,color:"#484f58",fontStyle:"italic"}}>(空)</div>}
        </>)}
      </React.Fragment>
    );
  });

  if (showWelcome || !workspace) return (
    <div className="fm-welcome">
      <div className="fm-welcome-logo">📂</div>
      <div className="fm-welcome-title">项目工作区</div>
      <div className="fm-welcome-sub">选择或创建项目目录，开始编写代码</div>
      <div className="fm-welcome-actions">
        <button className="fm-btn primary" onClick={()=>openBrowser("open")}>📂 打开已有文件夹</button>
        <button className="fm-btn green" onClick={()=>openBrowser("create")}>➕ 新建项目</button>
      </div>
      {recent.length>0 && <div className="fm-recent"><div className="fm-recent-title">最近打开</div>{recent.map(p=><div key={p} className="fm-recent-item" onClick={()=>{setWorkspace(p);setShowWelcome(false);}}><span>📁</span><span className="fm-recent-path">{p}</span></div>)}</div>}
      {browseVis && renderBrowser()}
    </div>
  );


  const ext = extOf(selectedFile.split(/[\\/]/).pop()||"");
  return (
    <div className="fm-root">
      <div className="fm-toolbar"><span className="fm-toolbar-title">📂 文件管理</span>
        <div className="fm-toolbar-actions"><button className="fm-icon-btn" title="新建文件" onClick={()=>setNewItem({parentPath:workspace,isDir:false})}>📄+</button><button className="fm-icon-btn" title="新建文件夹" onClick={()=>setNewItem({parentPath:workspace,isDir:true})}>📁+</button><button className="fm-icon-btn" title="刷新" onClick={loadTree}>↻</button><div style={{flex:1}}/><button className="fm-icon-btn" title="切换项目" onClick={()=>setShowWelcome(true)}>📂</button></div>
      </div>
      <div className="fm-breadcrumb">{workspace.split(/[\\/]/).filter(Boolean).map((part,i,arr)=>{const p2=workspace.split(/[\\/]/).slice(0,i+1).join(workspace.includes("/")?"/":"\\");return <React.Fragment key={i}>{i>0&&<span className="fm-bsep">/</span>}<span className={"fm-bpart"+(i===arr.length-1?" cur":"")} onClick={()=>{if(i<arr.length-1){setWorkspace(p2);setTree([]);}}}>{i===0?"🌐 "+part:part}</span></React.Fragment>;})}</div>
      <div className="fm-split">
        <div className="fm-tree">{newItem && newItem.parentPath===workspace && (
    <div>
      <div style={{padding:4,paddingLeft:8,display:"flex",alignItems:"center",gap:4}}>
        <span style={{width:14}}/><span className="fm-icon">{newItem.isDir?"📁":"📄"}</span>
        <input className="fm-rename" value={newName}
          onChange={e=>setNewName(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")createItem();if(e.key==="Escape"){setNewItem(null);setNewName("");}}}
          onBlur={()=>{setTimeout(()=>{if(templateClickedRef.current){templateClickedRef.current=false;return;} if(newName.trim())createItem();else{setNewItem(null);setNewName("");}},200);}}
          autoFocus placeholder={newItem.isDir?"新文件夹名...":"文件名 如 main.py"}/>
      </div>
      {!newItem.isDir && <div style={{padding:"2px 8px 6px 38px",display:"flex",flexWrap:"wrap",gap:4}}>
        {Object.values(FILE_TEMPLATES).map(t => (
          <button key={t.ext} className="fm-tpl-btn" title={t.ext}
            onClick={()=>{templateClickedRef.current=true; const base=newName.trim(); const nm=base?(base.endsWith(t.ext)?base:base+t.ext):("file"+t.ext); setNewName(nm); setTimeout(()=>createItemWithTemplate(t),50);}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>}
    </div>
  )}
      {tree.length===0?<div className="fm-empty">加载中...</div>:renderTree(tree,0)}</div>
        {selectedFile ? <div className="fm-editor-panel">
          <div className="fm-tab-bar"><div className="fm-tab active"><span>{ICON[ext]||"\ud83d\udcc4"}</span><span>{selectedFile.split(/[\\/]/).pop()}</span>{dirty&&<span className="fm-dot">●</span>}</div><div style={{flex:1}}/><span className="fm-lang">{LANG[ext]||"text"}</span><button className={"fm-tbtn"+(isEditing?" editing":"")} onClick={()=>{if(isEditing&&dirty)saveFile();else{setIsEditing(!isEditing);setEditContent(fileContent);setDirty(false);}}}>{isEditing?"💾 保存":"✏️ 编辑"}</button><button className="fm-tbtn run" onClick={runFile} disabled={running}>{running?"⏳ ...":"▶ 运行"}</button></div>
          {isEditing ? <textarea className="fm-textarea" value={editContent} onChange={e=>{setEditContent(e.target.value);setDirty(true);}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();saveFile();}}}/> : <pre className="fm-pre">{fileContent.slice(0,100000)}{fileContent.length>100000?"\n...[截断]":""}</pre>}
          {runResult&&<div className="fm-run-result"><div className="fm-run-header"><span className={runResult.success?"success":"fail"}>{runResult.success?"✅":"❌"} {runResult.language||""} {runResult.duration?runResult.duration+"ms":""}</span>{runResult.exitCode!==undefined&&<span className="fm-exit">exit: {runResult.exitCode}</span>}</div>{runResult.compileOutput&&<pre className="fm-compile">{runResult.compileOutput}</pre>}<pre className={"fm-output"+(runResult.success?"":" error")}>{runResult.output ? (runResult.output.startsWith("Unsupported file type") ? "❌ 仅支持以下文件类型：" + runResult.output.replace("Unsupported file type: ", "").split(". Supported: ")[1] : runResult.output) : "(无输出)"}</pre></div>}
        </div> : <div className="fm-no-file"><div style={{fontSize:40,marginBottom:8}}>📝</div><div>点击文件树中的文件来查看或编辑</div></div>}
      </div>
      {ctxMenu&&<div className="fm-ctx" style={{left:ctxMenu.x,top:ctxMenu.y}}>
        <div className="fm-ctx-item" onClick={()=>{openFile(ctxMenu.path);setCtxMenu(null);}}>👁 打开</div>
        {!ctxMenu.isDir&&<div className="fm-ctx-item" onClick={()=>{setSelectedFile(ctxMenu.path);setCtxMenu(null);setTimeout(runFile,100);}}>▶ 运行</div>}
        {ctxMenu.isDir&&<><div className="fm-ctx-item" onClick={()=>{setNewItem({parentPath:ctxMenu.path,isDir:false});setCtxMenu(null);}}>📄+ 新建文件</div><div className="fm-ctx-item" onClick={()=>{setNewItem({parentPath:ctxMenu.path,isDir:true});setCtxMenu(null);}}>📁+ 新建文件夹</div></>}
        <div className="fm-ctx-sep"/><div className="fm-ctx-item" onClick={()=>{setRenaming(ctxMenu.path);setRenameName(ctxMenu.name);setCtxMenu(null);}}>✏️ 重命名</div><div className="fm-ctx-item danger" onClick={()=>{deleteItem(ctxMenu.path,ctxMenu.name);setCtxMenu(null);}}>🗑️ 删除</div>
      </div>}
      {browseVis&&renderBrowser()}
    </div>
  );


  function renderBrowser() { return (
    <div className="fm-modal-overlay" onClick={()=>setBrowseVis(false)}><div className="fm-modal" onClick={e=>e.stopPropagation()}>
      <div className="fm-modal-header"><span>{browseMode==="create"?"➕ 新建项目":"📂 打开文件夹"}</span><button className="fm-modal-close" onClick={()=>setBrowseVis(false)}>✕</button></div>
      {browseMode==="create"&&<div className="fm-modal-field"><label>项目名称</label><input value={projName} onChange={e=>setProjName(e.target.value)} placeholder="my-project" autoFocus/></div>}
      <div className="fm-modal-path">{browsePath||"选择驱动器..."}</div>
      <div className="fm-modal-list">{browseLoading?<div className="fm-modal-loading">加载中...</div>:browseEntries.map(e=><div key={e.path} className={"fm-modal-entry"+(e.isDir?"":" disabled")} onClick={()=>e.isDir&&navBrowse(e.path)}><span>{e.isDir?"📁":"📄"}</span><span>{e.name}</span></div>)}</div>
      <div className="fm-modal-footer"><button className="fm-btn" onClick={()=>{if(browsePath){const p=browsePath.replace(/[\\/][^\\/]+[\\/]?$/,"");navBrowse(p||"");}}}>← 上级</button><div style={{flex:1}}/><button className="fm-btn" onClick={()=>setBrowseVis(false)}>取消</button><button className="fm-btn primary" disabled={!browsePath||(browseMode==="create"&&!projName.trim())} onClick={confirmBrowse}>{browseMode==="create"?"创建并打开":"选择此文件夹"}</button></div>
    </div></div>
  ); }
}
