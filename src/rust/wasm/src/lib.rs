use softmatcha_core::{indexing::PortableIndexRepository, Document, Engine, Model, Shard};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub struct SearchEngine {
    inner: Engine,
}
#[wasm_bindgen]
impl SearchEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(vectors: Vec<f32>, dimensions: usize) -> Result<SearchEngine, JsValue> {
        Ok(Self {
            inner: Engine::new(
                Model::new(vectors, dimensions).map_err(|e| JsValue::from_str(&e))?,
                PortableIndexRepository::default(),
            ),
        })
    }
    pub fn replace_shard(&mut self, id: String, documents: String) -> Result<(), JsValue> {
        let docs: Vec<Document> =
            serde_json::from_str(&documents).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.inner
            .replace(id, docs)
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn export_shard(&self, id: String) -> Result<Vec<u8>, JsValue> {
        self.inner
            .repository
            .shards
            .get(&id)
            .ok_or_else(|| JsValue::from_str("Unknown shard"))?
            .encode()
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn restore_shard(&mut self, id: String, bytes: Vec<u8>) -> Result<(), JsValue> {
        let shard = Shard::decode(&bytes, &self.inner.model).map_err(|e| JsValue::from_str(&e))?;
        self.inner.repository.shards.insert(id, shard);
        Ok(())
    }
    pub fn remove_shard(&mut self, id: String) {
        self.inner.repository.shards.remove(&id);
    }
    pub fn search(
        &self,
        query: Vec<u32>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Result<String, JsValue> {
        let hits = self
            .inner
            .search(
                query.into_iter().map(u64::from).collect(),
                minimum,
                limit,
                budget_ms,
            )
            .map_err(|e| JsValue::from_str(&e))?;
        serde_json::to_string(&hits).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

/// A single bounded disk-backed shard; no resident vector model.
#[wasm_bindgen]
pub struct MobileShard {
    shard: Shard,
    size: usize,
}
#[wasm_bindgen]
impl MobileShard {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>, size: usize) -> Result<MobileShard, JsValue> {
        Ok(Self {
            shard: Shard::decode_for_size(&bytes, size).map_err(|e| JsValue::from_str(&e))?,
            size,
        })
    }
    pub fn build(
        documents: String,
        size: usize,
        dimensions: usize,
        ids: Vec<u32>,
        vectors: Vec<f32>,
    ) -> Result<Vec<u8>, JsValue> {
        let docs: Vec<Document> =
            serde_json::from_str(&documents).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Shard::build_compact(docs, size, dimensions, ids, vectors)
            .and_then(|s| s.encode())
            .map_err(|e| JsValue::from_str(&e))
    }
    pub fn search(
        &self,
        query: Vec<u32>,
        scores: Vec<f32>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Result<String, JsValue> {
        if query.is_empty()
            || query.len() > 12
            || query.iter().any(|&id| id as usize >= self.size - 1)
            || scores.len() != query.len() * self.size
            || scores.iter().any(|v| !v.is_finite())
            || !(0.1..=1.).contains(&minimum)
            || limit == 0
            || limit > 100
            || !budget_ms.is_finite()
            || budget_ms <= 0.
        {
            return Err(JsValue::from_str("Invalid mobile search"));
        }
        let query: Vec<u64> = query.into_iter().map(u64::from).collect();
        let scores = ndarray::Array2::from_shape_vec((query.len(), self.size), scores)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_json::to_string(
            &self
                .shard
                .search_with_scores(&query, &scores, minimum, limit, budget_ms),
        )
        .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[wasm_bindgen]
pub fn vector_scores(
    vectors: Vec<f32>,
    lengths: Vec<f32>,
    queries: Vec<f32>,
    query_lengths: Vec<f32>,
    dimensions: usize,
) -> Result<Vec<f32>, JsValue> {
    if dimensions == 0
        || vectors.len() != lengths.len() * dimensions
        || queries.len() != query_lengths.len() * dimensions
        || query_lengths.len() > 12
    {
        return Err(JsValue::from_str("Invalid score block"));
    }
    let mut out = Vec::with_capacity(lengths.len() * query_lengths.len());
    for (i, q) in queries.chunks_exact(dimensions).enumerate() {
        for (j, v) in vectors.chunks_exact(dimensions).enumerate() {
            out.push(
                q.iter().zip(v).map(|(a, b)| a * b).sum::<f32>() / (query_lengths[i] * lengths[j]),
            );
        }
    }
    Ok(out)
}
