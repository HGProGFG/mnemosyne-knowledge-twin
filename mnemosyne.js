const seedDocuments=[
 {id:"system-design",name:"System Design Notes.md",space:"personal-os",createdAt:"2026-07-06T09:00:00Z",chunks:[
  "Retrieval architecture decision: start with hybrid retrieval rather than betting on embeddings alone. Dense similarity is useful for paraphrases, while keyword search preserves exact names, acronyms, and error messages. Merge both candidate lists and apply a lightweight reranker before generation.",
  "Every generated claim must be traceable to a source chunk. Citation precision matters more than answer fluency in the first release. If retrieved evidence is weak or contradictory, the system should say that it is uncertain instead of filling the gap.",
  "The knowledge graph is a derived view over documents, people, topics, decisions, and dates. Graph edges help multi-hop questions and exploration while documents remain the source of truth.",
  "My view on microservices changed during the prototype. I initially preferred separating ingestion, retrieval, and generation into independent services. The operational overhead was larger than the scaling benefit, so the current choice is a modular monolith with clear internal boundaries. Split a service only after measured load or ownership pressure justifies it.",
  "Evaluation plan: maintain a small golden question set, record Recall at 5 and citation precision, then compare every retrieval change against the baseline. A prettier answer is not an improvement if the supporting evidence gets worse."
 ]},
 {id:"learning-journal",name:"ML Learning Journal.md",space:"ml-research",createdAt:"2026-07-04T09:00:00Z",chunks:[
  "Learning review: I am comfortable with supervised learning, embeddings, and basic transformer architecture. My weaker areas are calibration, learning-to-rank, and designing evaluation datasets that reflect real user failure modes.",
  "The most valuable next learning step is implementing a reranker training loop with hard negatives from actual retrieval mistakes. Reading more model papers is lower priority than building a reproducible evaluation harness.",
  "A recurring lesson is that data quality and evaluation discipline beat model size. I spent too much time comparing embedding models before checking whether document chunk boundaries preserved the information needed to answer questions.",
  "Personal goal for the next month: understand confidence calibration, build a fifty-question evaluation set, and learn enough MLOps to reproduce experiments from a clean environment."
 ]},
 {id:"project-retro",name:"Q2 Project Retrospective.md",space:"work-notes",createdAt:"2026-07-02T09:00:00Z",chunks:[
  "The prototype succeeded when it made evidence visible. Test users trusted concise answers with clear citations more than long answers that sounded intelligent but hid their sources.",
  "The biggest failure was building too much infrastructure before measuring retrieval. Most early errors came from poor parsing and vague evaluation questions. The next version should keep deployment simple and invest in observability around retrieval results.",
  "Product direction: optimize for decisions, not chat volume. The interface should reveal changed opinions, unresolved contradictions, and useful next actions rather than encourage endless conversation."
 ]}
];

const stopwords=new Set("a an and are as at be been but by can did do does for from had has have how i if in into is it its me my of on or our should so than that the their them then this to was we what when where which who will with would you your".split(" "));
let documents=[...seedDocuments];
let database;

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const escapeHtml=value=>String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const tokens=text=>text.toLowerCase().replace(/[^a-z0-9\s-]/g," ").split(/\s+/).filter(token=>token.length>1&&!stopwords.has(token));

function openDatabase(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open("mnemosyne-local",1);
  request.onupgradeneeded=()=>request.result.createObjectStore("documents",{keyPath:"id"});
  request.onsuccess=()=>{database=request.result;resolve(database)};
  request.onerror=()=>reject(request.error);
 });
}
function readLocalDocuments(){
 return new Promise(resolve=>{const request=database.transaction("documents").objectStore("documents").getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([])});
}
function saveLocalDocument(documentRecord){
 return new Promise((resolve,reject)=>{const request=database.transaction("documents","readwrite").objectStore("documents").put(documentRecord);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error)});
}

function cleanMarkdownText(value){
 return String(value)
  .replace(/^\s*```.*$/gm,"")
  .replace(/^\s*#{1,6}\s+(.+)$/gm,"$1\n")
  .replace(/^\s*>\s?/gm,"")
  .replace(/^\s*[-*+]\s+/gm,"")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
  .replace(/(\*\*|__)(.*?)\1/g,"$2")
  .replace(/(\*|_)(.*?)\1/g,"$2")
  .replace(/`([^`]+)`/g,"$1")
  .replace(/~~(.*?)~~/g,"$1")
  .replace(/\n{3,}/g,"\n\n")
  .trim();
}

function chunkText(text){
 const cleaned=cleanMarkdownText(text).replace(/\r/g,"").replace(/[ \t]+/g," ").trim();
 if(!cleaned)return[];
 const parts=cleaned.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9#])/).map(part=>part.trim()).filter(Boolean);
 const chunks=[];let current="";
 for(const part of parts){if((current+" "+part).length>760&&current){chunks.push(current);current=part}else current=current?`${current} ${part}`:part}
 if(current)chunks.push(current);return chunks.slice(0,250);
}

function updateDashboard(){
 const chunks=documents.flatMap(documentRecord=>documentRecord.chunks);
 const words=chunks.reduce((sum,chunk)=>sum+chunk.split(/\s+/).length,0);
 $("#document-count").textContent=documents.length;
 $("#nav-doc-count").textContent=documents.length;
 $("#chunk-count").textContent=chunks.length;
 $("#stat-chunks").textContent=chunks.length;
 $("#word-count").textContent=words>999?`${(words/1000).toFixed(1)}k`:words;
 const list=$("#document-list");list.innerHTML="";
 documents.slice(0,4).forEach((documentRecord,index)=>{
  const row=document.createElement("div");row.className="document-row";
  row.innerHTML=`<div class="file-icon file-${index%3}">▤</div><div><strong>${escapeHtml(documentRecord.name)}</strong><span>${documentRecord.chunks.length} chunks · Ready</span></div><span class="ready-check">✓</span>`;
  list.appendChild(row);
 });
 window.dispatchEvent(new CustomEvent("mnemosyne:documents-updated"));
}

function rankEvidence(question){
 const query=tokens(question);const activeSpace=window.mnemosyneActiveSpace;const scopedDocuments=activeSpace&&window.mnemosyneDocumentSpace?documents.filter(documentRecord=>window.mnemosyneDocumentSpace(documentRecord)===activeSpace):documents;const chunks=scopedDocuments.flatMap(documentRecord=>documentRecord.chunks.map((content,position)=>({documentId:documentRecord.id,name:documentRecord.name,content,position})));
 const frequency=new Map();for(const term of new Set(query))frequency.set(term,chunks.filter(chunk=>tokens(chunk.content).includes(term)).length);
 return chunks.map(chunk=>{const words=tokens(chunk.content),counts=new Map();words.forEach(word=>counts.set(word,(counts.get(word)||0)+1));let score=0;for(const term of query){const tf=counts.get(term)||0,idf=Math.log((chunks.length+1)/((frequency.get(term)||0)+1))+1;score+=(tf/Math.max(words.length,1))*idf*12;if(chunk.content.toLowerCase().includes(term))score+=.06}return{...chunk,score}}).sort((a,b)=>b.score-a.score).slice(0,3);
}

function composeAnswer(question,ranked){
 if(!ranked.length||ranked[0].score<.08)return"I couldn’t find strong enough evidence for that question in your current library. Add a relevant note or use a more specific topic—I’d rather stay uncertain than invent an answer.";
 const evidence=ranked.filter(item=>item.score>=Math.max(.08,ranked[0].score*.28));
 const q=question.toLowerCase();
 const lead=q.includes("changed")||q.includes("change")?"Your notes show a clear shift in thinking. ":q.includes("next")||q.includes("focus")||q.includes("learn")?"The evidence points to a practical next step. ":"Across your notes, the strongest conclusion is this: ";
 const sentences=evidence.flatMap(item=>cleanMarkdownText(item.content).split(/(?<=[.!?])\s+/)).filter(sentence=>sentence.length>35).slice(0,4);
 return lead+sentences.join(" ")+(evidence.length>1?" Together, these sources suggest the pattern is consistent rather than a one-off observation.":"");
}

function askQuestion(question){
 const query=question.trim();if(!query)return;
 const started=performance.now();
 $("#question-input").value=query;$("#send-button").disabled=true;
 $("#empty-state").classList.add("hidden");$("#answer-view").classList.remove("hidden");
 $("#asked-question").textContent=query;$("#answer-card").classList.add("hidden");$("#thinking-card").classList.remove("hidden");
 setTimeout(()=>{
  const ranked=rankEvidence(query),top=ranked[0]?.score||0,confidence=Math.min(.94,Math.max(.18,top/(top+.35))),evidence=ranked.filter(item=>item.score>=Math.max(.08,top*.28));
  $("#answer-copy").textContent=composeAnswer(query,ranked);
  $("#answer-meta").textContent=`${Math.max(7,Math.round(performance.now()-started))} ms · ${evidence.length} sources`;
  const confidenceNode=$("#confidence");confidenceNode.className=`confidence ${confidence>.62?"high":"medium"}`;confidenceNode.querySelector("span").textContent=`${Math.round(confidence*100)}% confidence`;
  $("#inline-sources").innerHTML=evidence.map((item,index)=>`<span>[${index+1}] ${escapeHtml(item.name)}</span>`).join("");
  $("#thinking-card").classList.add("hidden");$("#answer-card").classList.remove("hidden");
 },420);
}

function showToast(message){const toast=$("#toast");toast.querySelector("p").textContent=message;toast.classList.remove("hidden");setTimeout(()=>toast.classList.add("hidden"),2600)}
function openUpload(){$("#upload-error").classList.add("hidden");$("#upload-modal").classList.remove("hidden")}
function closeUpload(){$("#upload-modal").classList.add("hidden")}

async function handleFile(file){
 const error=$("#upload-error");error.classList.add("hidden");
 if(!file)return;
 if(file.size>2*1024*1024){error.textContent="The file must be smaller than 2 MB.";error.classList.remove("hidden");return}
 if(!/\.(txt|md)$/i.test(file.name)){error.textContent="This version supports .txt and .md files.";error.classList.remove("hidden");return}
 const text=await file.text(),chunks=chunkText(text);
 if(!chunks.length){error.textContent="This document does not contain indexable text.";error.classList.remove("hidden");return}
 const documentRecord={id:crypto.randomUUID(),name:file.name,space:window.mnemosyneActiveSpace||"personal-os",createdAt:new Date().toISOString(),chunks};
 try{await saveLocalDocument(documentRecord);documents=[documentRecord,...documents];updateDashboard();closeUpload();showToast(`${file.name} indexed locally`)}catch{error.textContent="Your browser could not save this file.";error.classList.remove("hidden")}
}

function bindInteractions(){
 $$("[data-question]").forEach(button=>button.addEventListener("click",()=>askQuestion(button.dataset.question)));
 $("#question-input").addEventListener("input",event=>$("#send-button").disabled=!event.target.value.trim());
 $("#question-input").addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();askQuestion(event.target.value)}});
 $("#ask-form").addEventListener("submit",event=>{event.preventDefault();askQuestion($("#question-input").value)});
 $("#new-question").addEventListener("click",()=>{$("#answer-view").classList.add("hidden");$("#empty-state").classList.remove("hidden");$("#question-input").value="";$("#send-button").disabled=true;$("#question-input").focus()});
 $("#open-upload").addEventListener("click",openUpload);$("#close-upload").addEventListener("click",closeUpload);
 $("#upload-modal").addEventListener("click",event=>{if(event.target.id==="upload-modal")closeUpload()});
 $("#choose-file").addEventListener("click",()=>$("#file-input").click());$("#file-input").addEventListener("change",event=>handleFile(event.target.files[0]));
 $("#open-nav").addEventListener("click",()=>{$("#sidebar").classList.add("sidebar-open");$("#nav-scrim").classList.add("show")});
 [$("#close-nav"),$("#nav-scrim")].forEach(node=>node.addEventListener("click",()=>{$("#sidebar").classList.remove("sidebar-open");$("#nav-scrim").classList.remove("show")}));
 $$("[data-feedback]").forEach(button=>button.addEventListener("click",()=>showToast(button.dataset.feedback==="helpful"?"Feedback saved on this device":"Thanks — we’ll use this as a hard negative")));
 document.addEventListener("keydown",event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("#question-input").focus()}if(event.key==="Escape")closeUpload()});
}

async function init(){
 bindInteractions();
 try{await openDatabase();const localDocuments=await readLocalDocuments();documents=[...localDocuments,...seedDocuments]}catch{showToast("Private storage unavailable; using this session only")}
 updateDashboard();
}
document.addEventListener("DOMContentLoaded",init);
