"""Read-only vault indexing; immutable, content-addressed SoftMatcha 2 shards."""
from __future__ import annotations
import bisect, hashlib, json, os, threading, time, subprocess, sys
from pathlib import Path
from collections import OrderedDict
from contextlib import asynccontextmanager
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel, Field

class Query(BaseModel):
    corpus: str = 'default'
    query: str = Field(min_length=1, max_length=512)
    limit: int = Field(default=50, ge=1, le=100)
    min_similarity: float = Field(default=.45, ge=.1, le=1)

class Engine:
    def __init__(self, vault: Path, state: Path, backend='fasttext', model='fasttext-ja-vectors', shards=8, excludes=()):
        self.vault=vault.resolve(); self.state=state.resolve(); self.backend=backend; self.model=model
        if not self.vault.is_dir(): raise ValueError('Vault directory does not exist')
        if self.state==self.vault: raise ValueError('Index directory must not be the vault root')
        self.shards=shards; self.excludes=tuple(excludes); self.snapshot=[]; self.error=None; self.building=False; self.updated=None
        self.lock=threading.Lock(); self.models=None; self.cache=OrderedDict(); self.normalized={}; self.documents={}
        self.cache_capacity=8; self.warmed_generation=None; self.warming=False
        self.state.mkdir(parents=True,exist_ok=True)
    def files(self):
        result=[]
        for p in self.vault.rglob('*.md'):
            rel=p.relative_to(self.vault)
            if any(part.startswith('.') for part in rel.parts) or p.is_symlink(): continue
            if self.vault not in p.resolve().parents or p.is_relative_to(self.state): continue
            if any(rel.as_posix().startswith(x.strip('/')+'/') or rel.as_posix()==x.strip('/') for x in self.excludes):continue
            result.append(p)
        return sorted(result)
    def refresh(self):
        if self.building:return
        self.building=True
        try:
            if self.backend=='compact-ja':
                from model_adapter import prepare
                prepare(Path(self.model))
            buckets=[[] for _ in range(self.shards)]
            for p in self.files():
                path=p.relative_to(self.vault).as_posix()
                buckets[int(hashlib.sha256(path.encode()).hexdigest(),16)%self.shards].append((path,p))
            snapshot=[]
            for bucket in buckets:
                if not bucket:continue
                bucket=[(path,p.read_bytes()) for path,p in bucket]
                for _,raw in bucket:raw.decode('utf-8')
                digest=hashlib.sha256((self.backend+'\0'+self.model).encode())
                for path,raw in bucket:digest.update(json.dumps([path,len(raw)]).encode());digest.update(raw)
                folder=self.state/digest.hexdigest(); folder.mkdir(exist_ok=True)
                if not (folder/'ready.json').exists():
                    spans=[];pos=0
                    with (folder/'corpus.txt').open('wb') as f:
                        for path,raw in bucket:
                            f.write(raw+b'\n\n');spans.append({'path':path,'start':pos,'end':pos+len(raw)});pos+=len(raw)+2
                    subprocess.run([sys.executable,str(Path(__file__).with_name('index_entry.py')),'--index',str(folder/'index'),'--backend',self.backend,'--model',self.model,'--mem_size','128','--mem_size_ex','32','--max_vocab','65536',str(folder/'corpus.txt')],check=True,timeout=3600)
                    (folder/'ready.json').write_text(json.dumps(spans,ensure_ascii=False))
                snapshot.append(folder)
            # A query takes a reference to a complete generation. Never mutate its files.
            self.snapshot=snapshot; self.updated=time.time();self.error=None
        except Exception as e:
            self.error=str(e)
        finally:self.building=False
    def load_models(self):
        if self.models is not None:return
        if self.backend=='compact-ja':
            from model_adapter import register_models
            register_models()
        from softmatcha.embeddings import get_embedding
        from softmatcha.tokenizers import get_tokenizer
        ec=get_embedding(self.backend);tc=get_tokenizer(self.backend)
        self.models=(ec.build(ec.Config(self.model,mmap=True)),tc.build(tc.Config(self.model)))

    def load_shard(self,folder):
        import numpy as np
        key=str(folder)
        if key not in self.cache:
            from resident import resident_searcher
            embedding,tokenizer=self.models
            self.cache[key]=resident_searcher(folder,tokenizer,embedding,self.normalized)
            if len(self.cache)>self.cache_capacity:
                evicted,_=self.cache.popitem(last=False);self.documents.pop(evicted,None)
        self.cache.move_to_end(key)
        if key not in self.documents:
            spans=json.loads((folder/'ready.json').read_text());starts=[s['start'] for s in spans]
            raw=(folder/'corpus.txt').read_bytes()
            newlines=np.flatnonzero(np.frombuffer(raw,dtype=np.uint8)==10)
            self.documents[key]=(spans,starts,raw,newlines)
        return self.cache[key]

    def warmup(self):
        if not self.snapshot or not self.lock.acquire(blocking=False):return False
        try:
            generation=tuple(self.snapshot)
            if self.warmed_generation==generation:return True
            self.warming=True
            self.load_models()
            for folder in generation:self.load_shard(folder)
            self.warmed_generation=generation
            return True
        finally:self.warming=False;self.lock.release()

    def search(self,q:Query):
        if not self.snapshot:
            if self.error:raise HTTPException(503,'索引作成に失敗しました。サービスのログを確認してください。')
            if self.building:raise HTTPException(503,'初回索引を作成しています。少し待って検索してください。')
            return {'results':[],'message':'対象Markdownノートがありません。'}
        if not self.lock.acquire(blocking=False):raise HTTPException(429,'別の検索を処理中です。少し待って再検索してください。')
        try:
            import numpy as np
            import unicodedata
            needle=unicodedata.normalize('NFKC',q.query).casefold()
            title_hits={}
            for folder in self.snapshot:
                for entry in json.loads((folder/'ready.json').read_text()):
                    title=unicodedata.normalize('NFKC',Path(entry['path']).stem).casefold()
                    if needle in title:title_hits[(entry['path'],0)]={'path':entry['path'],'line':0,'excerpt':'ファイル名の一致','score':1.01}
            self.load_models()
            from softmatcha.search import Searcher
            from softmatcha.struct import Pattern
            from softmatcha_rs import get_match_range_rs
            embedding,tokenizer=self.models
            tokens=tokenizer(q.query)
            if len(tokens)==0:return {'results':[]}
            if len(tokens)>12:raise HTTPException(422,'SoftMatcha 2の検索語は分かち書き後12トークン以内にしてください。')
            if any(int(t)==tokenizer.unk_idx for t in tokens):
                if title_hits:return {'results':list(title_hits.values())[:q.limit],'message':'ファイル名の一致 · 本文検索にはモデル未登録語が含まれています'}
                raise HTTPException(422,'モデルの語彙にない語があります。別の表現で検索してください。')
            pattern=Pattern.build(tokens,Searcher.normalize(embedding(tokens)),[0.]*len(tokens))
            hits=title_hits; generation=list(self.snapshot);deadline=time.monotonic()+8
            for folder in generation:
                if time.monotonic()>=deadline:break
                key=str(folder)
                searcher=self.load_shard(folder)
                matched,scores,counts,threshold=searcher.search(pattern,20,q.min_similarity,max(.05,(deadline-time.monotonic())/len(generation)))
                spans,starts,raw,newlines=self.documents[key]
                with (folder/'corpus.txt').open('rb') as corpus:
                    for candidate,score in zip(matched,scores):
                        ids=[int(t) for t in candidate if int(t)<1_000_000_000]
                        if not ids:continue
                        l,r=get_match_range_rs(np.asarray(ids,dtype=np.uint64),searcher.rough,searcher.idx_fname,searcher.rough_div,searcher.num_tokens,searcher.idx_length)
                        for position in searcher.get_match_position(l,r,q.limit):
                            start=int(searcher.get_bytes_in_token(int(position)))
                            end=int(searcher.get_bytes_in_token(int(position)+len(ids)-1))+len(tokenizer.tokens[ids[-1]].encode())
                            idx=bisect.bisect_right(starts,start)-1
                            if idx<0 or end>spans[idx]['end']:continue
                            span=spans[idx]
                            line=int(np.searchsorted(newlines,start)-np.searchsorted(newlines,span['start']))
                            excerpt_start=max(span['start'],start-100)
                            before=raw[excerpt_start:start].decode('utf-8',errors='ignore')
                            matched_text=raw[start:end].decode('utf-8',errors='ignore')
                            after=raw[end:min(span['end'],end+150)].decode('utf-8',errors='ignore')
                            excerpt=before+matched_text+after
                            # Browser string offsets use UTF-16 code units, not UTF-8 bytes.
                            match_start=len(before.encode('utf-16-le'))//2
                            match_end=match_start+len(matched_text.encode('utf-16-le'))//2
                            hit={'path':span['path'],'line':line,'excerpt':excerpt,'score':float(score),'match_ranges':[[match_start,match_end]]}
                            hitkey=(span['path'],line)
                            if hitkey not in hits or score>hits[hitkey]['score']:hits[hitkey]=hit
            results=sorted(hits.values(),key=lambda h:(-h['score'],h['path'],h['line']))[:q.limit]
            return {'results':results,'indexed_at':self.updated,'message':f'{len(results)}件 · SoftMatcha 2'+(' · 索引更新中' if self.building else '')+' · 候補数と実行時間に上限があります'}
        finally:self.lock.release()

def create_app(engine,token,corpus='default'):
    if len(token)<24:raise ValueError('SOFTMATCHA_TOKEN must contain at least 24 characters')
    stop=threading.Event()
    def watcher():
        while not stop.is_set():
            engine.refresh()
            try:engine.warmup()
            except Exception as exc:engine.error=str(exc)
            stop.wait(60)
    @asynccontextmanager
    async def lifespan(app):
        worker=threading.Thread(target=watcher,daemon=True);worker.start();yield;stop.set()
    app=FastAPI(lifespan=lifespan)
    def authorize(value):
        import secrets
        if not secrets.compare_digest(value or '',f'Bearer {token}'):raise HTTPException(401,'Unauthorized')
    @app.get('/v1/status')
    def status(authorization:str|None=Header(default=None)):
        authorize(authorization);return {'ready':bool(engine.snapshot),'building':engine.building,'error':engine.error,'indexed_at':engine.updated,'warmed':engine.warmed_generation==tuple(engine.snapshot) if engine.snapshot else False,'warming':engine.warming}
    @app.post('/v1/warmup')
    def warmup(body:dict,tasks:BackgroundTasks,authorization:str|None=Header(default=None)):
        authorize(authorization)
        if body.get('corpus','default')!=corpus:raise HTTPException(404,'Unknown corpus')
        # Do not block the client while loading models and immutable index pages.
        tasks.add_task(engine.warmup)
        return {'warmed':engine.warmed_generation==tuple(engine.snapshot) if engine.snapshot else False,'warming':engine.warming or engine.building}
    @app.post('/v1/search')
    def search(q:Query,authorization:str|None=Header(default=None)):
        authorize(authorization)
        if q.corpus!=corpus:raise HTTPException(404,'Unknown corpus')
        return engine.search(q)
    return app

if __name__=='__main__':
    import argparse,uvicorn
    p=argparse.ArgumentParser();p.add_argument('--vault',type=Path,required=True);p.add_argument('--state',type=Path,default=Path('state'));p.add_argument('--backend',default='compact-ja');p.add_argument('--model',default=None);p.add_argument('--shards',type=int,default=8);p.add_argument('--exclude',action='append',default=[]);p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=8769);p.add_argument('--corpus',default='default');p.add_argument('--token-file',type=Path);args=p.parse_args()
    if not 1<=args.shards<=128:p.error('--shards must be between 1 and 128')
    model=args.model or str(args.state.resolve()/'models'/'compact-ja') if args.backend=='compact-ja' else args.model or 'fasttext-ja-vectors'
    engine=Engine(args.vault,args.state,args.backend,model,args.shards,args.exclude)
    token=os.environ.get('SOFTMATCHA_TOKEN','')
    if args.token_file:
        token_data=args.token_file.read_text().strip()
        token=json.loads(token_data)['token'] if token_data.startswith('{') else token_data
    uvicorn.run(create_app(engine,token,args.corpus),host=args.host,port=args.port)
