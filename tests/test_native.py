"""Real upstream Rust/Python search; tiny deterministic vectors, no download."""
import importlib.util,json
from pathlib import Path
import pytest
pytest.importorskip('softmatcha_rs')
import numpy as np
spec=importlib.util.spec_from_file_location('service',Path(__file__).parents[1]/'server/service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def test_real_softmatcha(tmp_path,monkeypatch):
 model=tmp_path/'models'/'fixture';model.mkdir(parents=True)
 words=['gold','winner','medalist','silver','research']+[f'word{i}' for i in range(123)]
 (model/'vocab.json').write_text(json.dumps({w:i for i,w in enumerate(words)}))
 vectors=np.random.default_rng(7).normal(size=(len(words)+1,16)).astype('float32')
 vectors[2]=vectors[1];vectors[-1]=0
 np.save(model/'embedding.npy',vectors)
 monkeypatch.setenv('GENSIM_DATA_DIR',str(tmp_path/'models'))
 vault=tmp_path/'vault';vault.mkdir();(vault/'日本語のパス.md').write_text(('gold medalist research\n'*100),encoding='utf8')
 e=m.Engine(vault,tmp_path/'state',backend='gensim',model='fixture',shards=1)
 e.refresh();assert e.error is None,e.error
 assert e.warmup()
 assert e.models is not None and len(e.cache)==len(e.snapshot)
 model_instance=e.models;cached=next(iter(e.cache.values()))
 assert e.warmup() and e.models is model_instance and next(iter(e.cache.values())) is cached
 result=e.search(m.Query(query='gold winner',min_similarity=.7))
 assert result['results'],result
 assert result['results'][0]['path']=='日本語のパス.md'
 assert 'gold medalist' in result['results'][0]['excerpt']
 assert result['results'][0]['line']>=0


def test_shared_vocabulary_and_unicode_lines(tmp_path,monkeypatch):
 from resident import normalize_rows,resident_searcher
 from softmatcha.search import Searcher
 vectors=np.array([[3.,4.],[0.,0.],[1.,-1.]],dtype=np.float32)
 assert np.allclose(normalize_rows(vectors),Searcher.normalize(vectors),atol=1e-7)
 model=tmp_path/'models'/'fixture';model.mkdir(parents=True)
 words=['gold','winner','medalist','silver','research']+[f'word{i}' for i in range(123)]
 (model/'vocab.json').write_text(json.dumps({w:i for i,w in enumerate(words)}))
 table=np.random.default_rng(7).normal(size=(len(words)+1,16)).astype('float32');table[2]=table[1];table[-1]=0
 np.save(model/'embedding.npy',table)
 monkeypatch.setenv('GENSIM_DATA_DIR',str(tmp_path/'models'))
 vault=tmp_path/'vault';vault.mkdir()
 (vault/'a.md').write_text('😀日本語の先頭行\ngold medalist research\n'*60,encoding='utf8')
 (vault/'b.md').write_text('gold medalist research\n'*60,encoding='utf8')
 e=m.Engine(vault,tmp_path/'state','gensim','fixture',shards=1);e.refresh();assert e.error is None
 r=e.search(m.Query(query='gold winner',min_similarity=.7))
 assert r['results']
 for hit in r['results']:
  assert 'gold' in (vault/hit['path']).read_text().splitlines()[hit['line']]
  start,end=hit['match_ranges'][0]
  highlighted=hit['excerpt'].encode('utf-16-le')[start*2:end*2].decode('utf-16-le')
  assert 'gold' in highlighted and 'medalist' in highlighted
 first=next(iter(e.cache.values()))
 from softmatcha.embeddings import get_embedding
 embedding,tokenizer=e.models
 second=resident_searcher(e.snapshot[0],tokenizer,embedding,e.normalized)
 assert first.vocabulary_embeddings is second.vocabulary_embeddings
 e.search(m.Query(query='gold winner',min_similarity=.7))
 assert next(iter(e.cache.values())) is first
