"""Reuse immutable vocabulary vectors and shard state across searches."""
import numpy as np
from types import SimpleNamespace

def normalize_rows(array):
    return (array/(np.linalg.norm(array,axis=-1,keepdims=True)+1e-12)).astype(np.float32)

def resident_searcher(folder,tokenizer,embedding,normalized):
    from softmatcha.search import Searcher
    class TableView:
        def __len__(self):return len(embedding.embeddings)
        def __getitem__(self,index):
            if isinstance(index,range):return embedding.embeddings[index.start:index.stop:index.step]
            return embedding.embeddings[index]
    class ResidentSearcher(Searcher):
        def normalize(self,array):
            size=len(array)
            if size not in normalized:normalized[size]=normalize_rows(array)
            return normalized[size]
        def get_bytes_in_token(self,position):
            position=int(position)
            if position not in self.positions:
                if len(self.positions)>=100000:self.positions.clear()
                self.positions[position]=super().get_bytes_in_token(position)
            return self.positions[position]
    searcher=ResidentSearcher(str(folder/'index'),tokenizer,SimpleNamespace(embeddings=TableView()))
    searcher.positions={}
    return searcher
