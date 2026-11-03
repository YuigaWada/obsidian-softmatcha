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
