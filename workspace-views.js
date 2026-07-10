const q=selector=>document.querySelector(selector);
const qa=selector=>[...document.querySelectorAll(selector)];
const defaultSpaces=[
 {id:"personal-os",name:"Personal OS",color:"lime"},
 {id:"ml-research",name:"ML research",color:"violet"},
 {id:"work-notes",name:"Work notes",color:"coral"}
];
const defaultDocumentSpaces={"system-design":"personal-os","learning-journal":"ml-research","project-retro":"work-notes"};
let workspaceSpaces=loadWorkspaceSpaces();
let documentSpaceMap=loadDocumentSpaceMap();
let activeView="ask";
let activeSpace="personal-os";
let activeGraphTopic="retrieval";

function loadWorkspaceSpaces(){
 try{
  const saved=JSON.parse(localStorage.getItem("mnemosyne-spaces-v1")||"[]");
  return [...defaultSpaces,...saved.filter(space=>!defaultSpaces.some(item=>item.id===space.id))];
 }catch{return[...defaultSpaces]}
}
function loadDocumentSpaceMap(){
 try{return{...defaultDocumentSpaces,...JSON.parse(localStorage.getItem("mnemosyne-document-spaces-v1")||"{}")}}catch{return{...defaultDocumentSpaces}}
}
function saveWorkspaceState(){
 localStorage.setItem("mnemosyne-spaces-v1",JSON.stringify(workspaceSpaces.filter(space=>!defaultSpaces.some(item=>item.id===space.id))));
 localStorage.setItem("mnemosyne-document-spaces-v1",JSON.stringify(documentSpaceMap));
}
function escapeWorkspaceHtml(value){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
function slugifySpace(value){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,36)||`space-${Date.now()}`}
function currentSpace(){return workspaceSpaces.find(space=>space.id===activeSpace)||workspaceSpaces[0]}
function workspaceDocumentSpace(documentRecord){return documentSpaceMap[documentRecord.id]||documentRecord.space||"personal-os"}
window.mnemosyneDocumentSpace=workspaceDocumentSpace;
window.mnemosyneActiveSpace=activeSpace;

function scopedDocuments(){return documents.filter(documentRecord=>workspaceDocumentSpace(documentRecord)===activeSpace)}
function spaceChunkCount(spaceId){return documents.filter(documentRecord=>workspaceDocumentSpace(documentRecord)===spaceId).reduce((sum,documentRecord)=>sum+documentRecord.chunks.length,0)}
function closeMobileNavigation(){q("#sidebar").classList.remove("sidebar-open");q("#nav-scrim").classList.remove("show")}

function renderSpaceList(){
 const list=q("#space-list");
 list.innerHTML=workspaceSpaces.map(space=>`<button class="space-item ${space.id===activeSpace?"active":""}" data-space="${escapeWorkspaceHtml(space.id)}"><i class="space-dot ${escapeWorkspaceHtml(space.color)}"></i><span class="space-name">${escapeWorkspaceHtml(space.name)}</span><span class="space-count">${spaceChunkCount(space.id)}</span></button>`).join("");
 list.querySelectorAll("[data-space]").forEach(button=>button.addEventListener("click",()=>selectSpace(button.dataset.space)));
}
function selectSpace(spaceId){
 activeSpace=spaceId;window.mnemosyneActiveSpace=spaceId;
 renderSpaceList();updateWorkspaceChrome();refreshContextDocuments();
 if(activeView!=="ask")renderActiveView();
 else if(q("#asked-question").textContent)q("#new-question").click();
 showToast(`Focused on ${currentSpace().name}`);closeMobileNavigation();
}
function updateWorkspaceChrome(){
 const space=currentSpace();
 const titles={ask:"Ask your knowledge",library:"Library",graph:"Knowledge graph",timeline:"Timeline"};
 q("#workspace-eyebrow").textContent=space.name.toUpperCase();
 q("#workspace-title").textContent=titles[activeView];
 q("#scope-button").textContent=`▱ ${space.name}`;
 qa("[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===activeView));
}
function setView(view){
 activeView=view;
 const isAsk=view==="ask";
 q("#feature-view").classList.toggle("hidden",isAsk);
 q("#ask-form").classList.toggle("hidden",!isAsk);
 if(isAsk){
  const hasQuestion=Boolean(q("#asked-question").textContent);
  q("#answer-view").classList.toggle("hidden",!hasQuestion);
  q("#empty-state").classList.toggle("hidden",hasQuestion);
 }else{
  q("#answer-view").classList.add("hidden");q("#empty-state").classList.add("hidden");renderActiveView();
 }
 updateWorkspaceChrome();closeMobileNavigation();
 history.replaceState(null,"",view==="ask"?location.pathname:`#${view}`);
}
function renderActiveView(){
 if(activeView==="library")renderLibrary();
 if(activeView==="graph")renderGraph();
 if(activeView==="timeline")renderTimeline();
}

function featureHeader(label,title,description,action=""){
 return `<header class="feature-header"><div><span class="eyebrow">${label}</span><h2>${title}</h2><p>${description}</p></div>${action?`<div class="feature-actions">${action}</div>`:""}</header>`;
}
function spaceOptions(selected){return workspaceSpaces.map(space=>`<option value="${escapeWorkspaceHtml(space.id)}" ${space.id===selected?"selected":""}>${escapeWorkspaceHtml(space.name)}</option>`).join("")}

function renderLibrary(search=""){
 const all=scopedDocuments();const term=search.trim().toLowerCase();
 const visible=term?all.filter(documentRecord=>(documentRecord.name+" "+documentRecord.chunks.join(" ")).toLowerCase().includes(term)):all;
 q("#feature-view").innerHTML=featureHeader("LOCAL LIBRARY",`${currentSpace().name} library`,"Browse, search, reorganize, and ask questions about every document stored in this space.",'<button class="feature-button primary" id="library-add">＋ Add document</button>')+`<div class="library-toolbar"><input class="library-search" id="library-search" type="search" placeholder="Search this space…" value="${escapeWorkspaceHtml(search)}"><div class="view-summary">${visible.length} of ${all.length} documents · ${all.reduce((sum,item)=>sum+item.chunks.length,0)} chunks</div></div><div class="library-grid" id="library-grid">${visible.length?visible.map(renderLibraryCard).join(""):'<div class="empty-panel"><strong>No documents found</strong>Add a document or choose another space from the sidebar.</div>'}</div>`;
 q("#library-add").addEventListener("click",openUpload);
 q("#library-search").addEventListener("input",event=>renderLibrary(event.target.value));
 qa("[data-document-space]").forEach(select=>select.addEventListener("change",()=>assignDocument(select.dataset.documentSpace,select.value)));
 qa("[data-ask-document]").forEach(button=>button.addEventListener("click",()=>askAboutDocument(button.dataset.askDocument)));
}
function renderLibraryCard(documentRecord){
 const preview=cleanMarkdownText(documentRecord.chunks[0]||"No preview available.");const space=workspaceDocumentSpace(documentRecord);
 return `<article class="library-card"><div class="library-card-top"><div class="library-card-icon">▤</div><span class="library-card-badge">${documentRecord.chunks.length} chunks</span></div><h3>${escapeWorkspaceHtml(documentRecord.name)}</h3><p>${escapeWorkspaceHtml(preview)}</p><div class="library-card-footer"><select aria-label="Move ${escapeWorkspaceHtml(documentRecord.name)} to space" data-document-space="${escapeWorkspaceHtml(documentRecord.id)}">${spaceOptions(space)}</select><button data-ask-document="${escapeWorkspaceHtml(documentRecord.id)}">Ask ↗</button></div></article>`;
}
function assignDocument(documentId,spaceId){
 documentSpaceMap[documentId]=spaceId;saveWorkspaceState();renderSpaceList();refreshContextDocuments();renderLibrary();showToast("Document moved locally");
}
function askAboutDocument(documentId){
 const documentRecord=documents.find(item=>item.id===documentId);if(!documentRecord)return;
 activeSpace=workspaceDocumentSpace(documentRecord);window.mnemosyneActiveSpace=activeSpace;renderSpaceList();setView("ask");askQuestion(`Summarize the key decisions in ${documentRecord.name}`);
}

function graphTerms(sourceDocuments){
 const ignored=new Set("about across after again alone also answer architecture because before being between build building current document documents every first from into local more notes only rather should source than their there these they this those through under using version what when where which while with would your".split(" "));
 const counts=new Map();
 sourceDocuments.forEach(documentRecord=>documentRecord.chunks.join(" ").toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/).filter(term=>term.length>4&&!ignored.has(term)).forEach(term=>counts.set(term,(counts.get(term)||0)+1)));
 return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([term,count])=>({term,count,documents:sourceDocuments.filter(item=>item.chunks.some(chunk=>chunk.toLowerCase().includes(term)))}));
}
function renderGraph(){
 const sourceDocuments=scopedDocuments();const terms=graphTerms(sourceDocuments);
 if(!terms.some(item=>item.term===activeGraphTopic))activeGraphTopic=terms[0]?.term||"knowledge";
 const positions=[[50,16],[77,26],[84,54],[70,80],[37,83],[16,63],[18,31],[50,51]];
 const lines=terms.map((_,index)=>{const [x,y]=positions[index];const dx=x-50,dy=y-50;const width=Math.max(45,Math.hypot(dx*5.1,dy*4.1));const angle=Math.atan2(dy,dx)*180/Math.PI;return `<i class="kg-line" style="left:50%;top:50%;width:${width}px;transform:rotate(${angle}deg)"></i>`}).join("");
 const nodes=terms.map((item,index)=>{const [x,y]=positions[index];return `<button class="kg-node ${item.term===activeGraphTopic?"active":""}" style="left:${x}%;top:${y}%" data-graph-topic="${escapeWorkspaceHtml(item.term)}">${escapeWorkspaceHtml(item.term)} · ${item.count}</button>`}).join("");
 q("#feature-view").innerHTML=featureHeader("CONNECTION MAP",`${currentSpace().name} graph`,"Explore recurring concepts and jump directly to the documents that support each connection.")+`<div class="graph-layout"><div class="knowledge-graph-canvas" aria-label="Interactive knowledge graph">${lines}<button class="kg-node root" style="left:50%;top:50%" data-graph-topic="${escapeWorkspaceHtml(activeGraphTopic)}">✦ ${escapeWorkspaceHtml(currentSpace().name)}</button>${nodes}</div><aside class="graph-inspector" id="graph-inspector"></aside></div>`;
 qa("[data-graph-topic]").forEach(button=>button.addEventListener("click",()=>{activeGraphTopic=button.dataset.graphTopic;renderGraph()}));
 renderGraphInspector(terms.find(item=>item.term===activeGraphTopic),sourceDocuments);
}
function renderGraphInspector(topic,sourceDocuments){
 const item=topic||{term:"knowledge",count:0,documents:sourceDocuments};
 q("#graph-inspector").innerHTML=`<span class="eyebrow">SELECTED CONCEPT</span><h3>${escapeWorkspaceHtml(item.term)}</h3><p>Appears ${item.count} times across ${item.documents.length} connected document${item.documents.length===1?"":"s"}.</p><div class="graph-source-list">${item.documents.map(documentRecord=>`<button class="graph-source" data-ask-document="${escapeWorkspaceHtml(documentRecord.id)}"><strong>${escapeWorkspaceHtml(documentRecord.name)}</strong><span>${documentRecord.chunks.length} evidence chunks · Ask about this connection ↗</span></button>`).join("")||'<div class="empty-panel">No connected sources yet.</div>'}</div>`;
 qa("#graph-inspector [data-ask-document]").forEach(button=>button.addEventListener("click",()=>askAboutDocument(button.dataset.askDocument)));
}

function renderTimeline(){
 const ordered=[...scopedDocuments()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 q("#feature-view").innerHTML=featureHeader("KNOWLEDGE HISTORY",`${currentSpace().name} timeline`,"Follow when knowledge entered this space and revisit the decisions captured in each document.",'<button class="feature-button" id="timeline-latest">Jump to latest</button>')+`<div class="timeline-list">${ordered.length?ordered.map(documentRecord=>`<article class="timeline-item"><time class="timeline-date" datetime="${escapeWorkspaceHtml(documentRecord.createdAt)}">${formatTimelineDate(documentRecord.createdAt)}</time><div class="timeline-copy"><strong>${escapeWorkspaceHtml(documentRecord.name)}</strong><span>${documentRecord.chunks.length} chunks indexed locally</span></div><button data-ask-document="${escapeWorkspaceHtml(documentRecord.id)}">Ask about it ↗</button></article>`).join(""):'<div class="empty-panel"><strong>No timeline entries</strong>Add a document to begin this space’s history.</div>'}</div>`;
 q("#timeline-latest").addEventListener("click",()=>q(".timeline-item")?.scrollIntoView({behavior:"smooth",block:"center"}));
 qa("[data-ask-document]").forEach(button=>button.addEventListener("click",()=>askAboutDocument(button.dataset.askDocument)));
}
function formatTimelineDate(value){return new Intl.DateTimeFormat("en",{month:"short",day:"numeric",year:"numeric"}).format(new Date(value))}

function refreshContextDocuments(){
 const visible=scopedDocuments();const list=q("#document-list");
 list.innerHTML=visible.slice(0,4).map((documentRecord,index)=>`<button class="document-row context-document" data-context-document="${escapeWorkspaceHtml(documentRecord.id)}"><div class="file-icon file-${index%3}">▤</div><div><strong>${escapeWorkspaceHtml(documentRecord.name)}</strong><span>${documentRecord.chunks.length} chunks · Ready</span></div><span class="ready-check">✓</span></button>`).join("")||'<p class="context-filter">No documents in this space yet.</p>';
 list.querySelectorAll("[data-context-document]").forEach(button=>button.addEventListener("click",()=>askAboutDocument(button.dataset.contextDocument)));
}
function openSpaceModal(){q("#space-error").classList.add("hidden");q("#space-modal").classList.remove("hidden");setTimeout(()=>q("#space-name-input").focus(),0)}
function closeSpaceModal(){q("#space-modal").classList.add("hidden");q("#space-form").reset()}
function createSpace(event){
 event.preventDefault();const input=q("#space-name-input");const name=input.value.trim();const error=q("#space-error");
 if(!name){error.textContent="Give this space a name.";error.classList.remove("hidden");return}
 let id=slugifySpace(name);if(workspaceSpaces.some(space=>space.id===id)){error.textContent="A space with that name already exists.";error.classList.remove("hidden");return}
 const color=new FormData(event.currentTarget).get("space-color")||"lime";workspaceSpaces.push({id,name,color});saveWorkspaceState();closeSpaceModal();activeSpace=id;window.mnemosyneActiveSpace=id;renderSpaceList();setView("library");showToast(`${name} created locally`);
}

function bindWorkspaceInteractions(){
 qa("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
 q("#view-library").addEventListener("click",()=>setView("library"));q("#explore-graph").addEventListener("click",()=>setView("graph"));
 q("#add-space").addEventListener("click",openSpaceModal);q("#close-space").addEventListener("click",closeSpaceModal);q("#space-form").addEventListener("submit",createSpace);
 q("#space-modal").addEventListener("click",event=>{if(event.target.id==="space-modal")closeSpaceModal()});
 q("#scope-button").addEventListener("click",()=>{q("#sidebar").classList.add("sidebar-open");q("#nav-scrim").classList.add("show");showToast("Choose a space from the sidebar")});
 window.addEventListener("mnemosyne:documents-updated",()=>{renderSpaceList();refreshContextDocuments();if(activeView!=="ask")renderActiveView()});
 document.addEventListener("keydown",event=>{if(event.altKey&&["1","2","3","4"].includes(event.key)){event.preventDefault();setView(["ask","library","graph","timeline"][Number(event.key)-1])}});
}
function initWorkspaceViews(){
 bindWorkspaceInteractions();renderSpaceList();refreshContextDocuments();
 const hash=location.hash.replace("#","");if(["library","graph","timeline"].includes(hash))activeView=hash;
 setView(activeView);
}
document.addEventListener("DOMContentLoaded",initWorkspaceViews);
