use crate::domain::*;
use ndarray::Array2;
use std::rc::Rc;
pub trait IndexRepository {
    fn replace(
        &mut self,
        key: String,
        documents: Vec<Document>,
        model: &Model,
    ) -> Result<(), String>;
    fn search(
        &self,
        model: &Model,
        query: &[u64],
        scores: &Array2<f32>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Vec<Hit>;
}
pub struct Engine<R: IndexRepository> {
    pub model: Rc<Model>,
    pub repository: R,
}
impl<R: IndexRepository> Engine<R> {
    pub fn new(model: Model, repository: R) -> Self {
        Self {
            model: Rc::new(model),
            repository,
        }
    }
    pub fn replace(&mut self, key: String, documents: Vec<Document>) -> Result<(), String> {
        self.repository.replace(key, documents, &self.model)
    }
    pub fn search(
        &self,
        query: Vec<u64>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Result<Vec<Hit>, String> {
        if query.is_empty()
            || query.len() > 12
            || query.iter().any(|v| *v as usize >= self.model.size - 1)
        {
            return Err("Search requires 1–12 known word IDs".into());
        }
        if !minimum.is_finite()
            || !(0.1..=1.).contains(&minimum)
            || limit == 0
            || limit > 100
            || !budget_ms.is_finite()
            || budget_ms <= 0.
        {
            return Err("Invalid search bounds".into());
        }
        let scores = self.model.scores(&query);
        let mut hits =
            self.repository
                .search(&self.model, &query, &scores, minimum, limit, budget_ms);
        hits.sort_by(|a, b| {
            b.score
                .total_cmp(&a.score)
                .then(a.path.cmp(&b.path))
                .then(a.line.cmp(&b.line))
        });
        hits.truncate(limit);
        Ok(hits)
    }
}
