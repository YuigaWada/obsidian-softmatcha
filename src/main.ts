import {App, Plugin, PluginSettingTab, Setting, SuggestModal, TFile, requestUrl, Notice} from 'obsidian';
interface Config { endpoint:string; token:string; corpus:string; similarity:number; limit:number }
interface Hit {path:string;line:number;excerpt:string;score:number;match_ranges?:[number,number][]}
const defaults:Config={endpoint:'http://127.0.0.1:8769',token:'',corpus:'default',similarity:0.45,limit:50};
export default class SoftMatchaPlugin extends Plugin {
 config:Config=defaults;
 activeSearch:Promise<unknown>=Promise.resolve();
 warmState='準備中…'; private stopped=false; private warmTimer:ReturnType<typeof setTimeout>|undefined; private warmVersion=0;
 async onload(){
  this.config={...defaults,...await this.loadData()};
  this.addCommand({id:'search',name:'Search vault',hotkeys:[{modifiers:['Mod','Shift'],key:'O'}],callback:()=>new Search(this.app,this).open()});
  this.addRibbonIcon('search','SoftMatcha Search',()=>new Search(this.app,this).open());
  this.addSettingTab(new Settings(this.app,this));
  this.app.workspace.onLayoutReady(()=>{if(!this.stopped)void this.prepareInBackground();});
 }
 onunload(){this.stopped=true;this.warmVersion++;clearTimeout(this.warmTimer);}
 async save(){await this.saveData(this.config);clearTimeout(this.warmTimer);void this.prepareInBackground();}
 private serviceUrl(path:string){
  const url=new URL(path,this.config.endpoint);
  if(url.protocol!=='https:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('リモート接続にはHTTPSを指定してください。');
  return url.toString();
 }
 async prepareInBackground(attempt=0,version=++this.warmVersion):Promise<void>{
  if(this.stopped||version!==this.warmVersion)return;
  try{
   if(!this.config.token){this.warmState='設定で検索サービスを指定してください';return;}
   const headers={'Content-Type':'application/json','Authorization':`Bearer ${this.config.token}`};
   const r=await requestUrl({url:this.serviceUrl('/v1/warmup'),method:'POST',headers,body:JSON.stringify({corpus:this.config.corpus}),throw:false});
   if(this.stopped||version!==this.warmVersion)return;
   if(r.status!==200)throw Error(`HTTP ${r.status}`);
   if(r.json?.warmed){this.warmState='検索準備完了';return;}
   this.warmState='モデル・索引を準備中…';
  }catch(e){if(this.stopped||version!==this.warmVersion)return;this.warmState='検索サービスに未接続';}
  if(attempt<60&&!this.stopped)this.warmTimer=setTimeout(()=>void this.prepareInBackground(attempt+1,version),2000);
 }
 async query(query:string):Promise<{results:Hit[];message?:string}>{
  const url=this.serviceUrl('/v1/search');
  const r=await requestUrl({url,method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${this.config.token}`},body:JSON.stringify({query,corpus:this.config.corpus,limit:this.config.limit,min_similarity:this.config.similarity}),throw:false});
  if(r.status!==200)throw Error(r.json?.detail??`検索サービス: HTTP ${r.status}`);
  return r.json;
 }
}
class Search extends SuggestModal<Hit>{
 timer:ReturnType<typeof setTimeout>|undefined; generation=0; pending:((x:Hit[])=>void)|undefined; status:HTMLElement; closed=false; composing=false;
 constructor(app:App,private plugin:SoftMatchaPlugin){super(app);this.setPlaceholder('SoftMatcha 2で検索…');this.setInstructions([{command:'↑↓',purpose:'選択'},{command:'Enter',purpose:'開く'},{command:'⌘/Ctrl+Enter',purpose:'新しいタブ'},{command:'Alt+Enter',purpose:'リンク挿入'}]);this.status=this.modalEl.createDiv({cls:'softmatcha-status',text:plugin.warmState});this.inputEl.addEventListener('compositionstart',()=>{this.composing=true;});this.inputEl.addEventListener('compositionend',()=>{this.composing=false;this.inputEl.dispatchEvent(new Event('input'));});}
 getSuggestions(query:string):Promise<Hit[]>{
  const id=++this.generation;clearTimeout(this.timer);this.pending?.([]);this.pending=undefined;
  if(!query.trim()||this.composing||this.closed)return Promise.resolve([]);
  return new Promise(resolve=>{this.pending=resolve;this.timer=setTimeout(async()=>{
   if(id!==this.generation){resolve([]);return;}
   const previous=this.plugin.activeSearch;let done!:()=>void;this.plugin.activeSearch=new Promise<void>(r=>{done=r;});await previous;
   if(id!==this.generation||this.closed){done();resolve([]);return;}
   this.status.setText('検索中…');
   try{const r=await this.plugin.query(query.trim());if(id===this.generation&&!this.closed){this.status.setText(r.message??`${r.results.length}件 · SoftMatcha 2`);resolve(r.results);}else resolve([]);}
   catch(e){if(id===this.generation&&!this.closed)this.status.setText(`${e instanceof Error?e.message:e} — 設定で接続先・トークンを確認してください。`);resolve([]);}
   finally{done();if(id===this.generation)this.pending=undefined;}
  },80);});
 }
 renderSuggestion(hit:Hit,el:HTMLElement){el.createDiv({cls:'softmatcha-title',text:hit.path.replace(/\.md$/,'')});const excerpt=el.createDiv({cls:'softmatcha-excerpt'});renderHighlighted(excerpt,hit.excerpt,hit.match_ranges??[]);el.createDiv({cls:'softmatcha-meta',text:`${hit.line+1}行目 · 類似度 ${hit.score.toFixed(3)}`});}
 onChooseSuggestion(hit:Hit,event:MouseEvent|KeyboardEvent){void this.openHit(hit,event);}
 async openHit(hit:Hit,event:MouseEvent|KeyboardEvent){const f=this.app.vault.getAbstractFileByPath(hit.path);if(!(f instanceof TFile)){new Notice('この端末にノートがありません。vaultの同期状態を確認してください。');return;}if(event.altKey){const editor=this.app.workspace.activeEditor?.editor;if(editor)editor.replaceSelection(this.app.fileManager.generateMarkdownLink(f,this.app.workspace.getActiveFile()?.path??''));return;}const leaf=this.app.workspace.getLeaf(event.metaKey||event.ctrlKey?'tab':false);await leaf.openFile(f,{eState:{line:hit.line}});}
 onClose(){this.closed=true;this.generation++;clearTimeout(this.timer);this.pending?.([]);this.pending=undefined;}
}
class Settings extends PluginSettingTab{
 constructor(app:App,private plugin:SoftMatchaPlugin){super(app,plugin);}
 display(){this.containerEl.empty();this.containerEl.createEl('p',{text:'SoftMatcha 2サービスが索引化したvaultと同じvaultを使ってください。クライアントはノートをアップロードしません。iOSではMac等のサービスへHTTPSで接続します。'});
 for(const [key,name,desc] of [['endpoint','検索サービスURL','Mac単体: http://127.0.0.1:8769。iOS: 到達可能なHTTPSアドレス。'],['token','アクセストークン','サービスのSOFTMATCHA_TOKENと一致させます。端末のプラグイン設定に保存されます。'],['corpus','コーパスID','サーバー側で許可されたコーパス名。']] as const){new Setting(this.containerEl).setName(name).setDesc(desc).addText(t=>{t.setValue(this.plugin.config[key]).onChange(async v=>{this.plugin.config[key]=v;await this.plugin.save();});if(key==='token')t.inputEl.type='password';});}
 new Setting(this.containerEl).setName('類似度の下限').addSlider(s=>s.setLimits(0.1,1,0.05).setValue(this.plugin.config.similarity).setDynamicTooltip().onChange(async v=>{this.plugin.config.similarity=v;await this.plugin.save();}));
 }
}

// Treat note text as text nodes; never interpret Markdown or HTML from results.
function renderHighlighted(el:HTMLElement,text:string,ranges:[number,number][]){
 const valid=ranges.filter(([a,b])=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>a&&b<=text.length).sort((a,b)=>a[0]-b[0]);
 const merged:[number,number][]=[];
 for(const [a,b] of valid){const last=merged[merged.length-1];if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
 let offset=0;
 for(const [a,b] of merged){el.appendText(text.slice(offset,a));el.createEl('mark',{cls:'softmatcha-match',text:text.slice(a,b)});offset=b;}
 el.appendText(text.slice(offset));
}
