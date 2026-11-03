"""Compact official fastText vectors for memory-constrained local deployments."""
from pathlib import Path
import gzip,json,os,urllib.request
import numpy as np

def prepare(directory:Path,limit=50000,language="ja"):
    if language not in ("ja","en"):raise ValueError("Unsupported model language")
    directory.mkdir(parents=True,exist_ok=True)
    if (directory/'vocab.json').exists() and (directory/'embedding.npy').exists():return
    url=f'https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.{language}.300.vec.gz'
    dictionary={};vectors=[]
    # Stream and close after the requested vocabulary: never download the full model.
    with urllib.request.urlopen(url,timeout=120) as response,gzip.GzipFile(fileobj=response) as stream:
        dimension=int(stream.readline().split()[1])
        for line in stream:
            values=line.decode('utf-8').rstrip().split(' ')
            if len(values)!=dimension+1 or values[0] in dictionary:continue
            vector=np.asarray(values[1:],dtype=np.float32)
            if not np.isfinite(vector).all():continue
            dictionary[values[0]]=len(vectors);vectors.append(vector)
            if len(vectors)>=limit:break
    table=np.vstack([*vectors,np.zeros(dimension,dtype=np.float32)])
    with (directory/'embedding.tmp').open('wb') as f:np.save(f,table)
    (directory/'embedding.tmp').replace(directory/'embedding.npy')
    (directory/'vocab.json').write_text(json.dumps(dictionary,ensure_ascii=False))
    (directory/'SOURCE.txt').write_text(url+'\nfastText crawl vectors; CC BY-SA 3.0. Vocabulary truncated to '+str(limit)+' entries.\nhttps://fasttext.cc/docs/en/crawl-vectors.html\n')

def register_models():
    from softmatcha.embeddings import register as embedding_register,Embedding
    from softmatcha.tokenizers import register as tokenizer_register,Tokenizer
    from softmatcha.tokenizers.mecab import TokenizerMecab
    @embedding_register('compact-ja')
    class CompactEmbedding(Embedding):
        @classmethod
        def load(cls,name_or_path,mmap=False):
            return np.load(Path(name_or_path)/'embedding.npy',mmap_mode='r' if mmap else None)
    @tokenizer_register('compact-ja')
    class CompactTokenizer(Tokenizer):
        @classmethod
        def build(cls,cfg):return TokenizerMecab.build(TokenizerMecab.Config(cfg.name_or_path))
        @property
        def unk_idx(self):raise NotImplementedError
        def tokenize(self,line):raise NotImplementedError
