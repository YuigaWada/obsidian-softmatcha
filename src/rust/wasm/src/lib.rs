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
