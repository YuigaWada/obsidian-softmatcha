use crate::{domain::*, helper, storage::IndexData, upstream};
use nalgebra::{DMatrix, SymmetricEigen};
use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Serialize, Deserialize)]
pub struct Shard {
    pub documents: Vec<Document>,
    pub(crate) ids: Vec<u32>,
    pub(crate) references: Vec<Option<Occurrence>>,
    pub(crate) sa: Vec<usize>,
    pub(crate) index: IndexData,
    pub(crate) rough: Vec<u64>,
    pub(crate) norm: Vec<f32>,
}
impl Shard {
    pub fn encode(&self) -> Result<Vec<u8>, String> {
        bincode::serialize(self).map_err(|e| e.to_string())
    }
    pub fn decode(bytes: &[u8], model: &Model) -> Result<Self, String> {
        use bincode::Options;
        let shard: Self = bincode::DefaultOptions::new()
            .with_fixint_encoding()
            .with_limit(128 * 1024 * 1024)
            .reject_trailing_bytes()
            .deserialize(bytes)
            .map_err(|e| e.to_string())?;
        let n = shard.ids.len();
        if n > 4_000_000
            || shard.references.len() != n
            || shard.sa.len() != n
            || shard.norm.len() != model.size
            || shard.rough.len() < 5
            || shard.rough.len() % 5 != 0
            || shard.index.bytes.len() % 32 != 0
            || shard.sa.iter().any(|p| *p >= n)
            || shard.ids.iter().any(|i| *i as usize >= model.size)
        {
            return Err("Invalid cached index".into());
        }
        for reference in shard.references.iter().flatten() {
            let doc = shard
                .documents
                .get(reference.document)
                .ok_or("Invalid cached document")?;
            if reference.start >= reference.end
                || reference.end > doc.text.len()
                || !doc.text.is_char_boundary(reference.start)
                || !doc.text.is_char_boundary(reference.end)
            {
                return Err("Invalid cached offsets".into());
            }
        }
        Ok(shard)
    }

    pub fn build(documents: Vec<Document>, model: &Model) -> Result<Self, String> {
        let unknown = (model.size - 1) as u32;
        let mut ids = Vec::new();
        let mut references = Vec::new();
        let mut freq = vec![0u64; model.size];
        for (di, doc) in documents.iter().enumerate() {
            if doc.path.starts_with('/') || doc.path.split('/').any(|p| p == "..") {
                return Err("Invalid note path".into());
            }
            for t in &doc.tokens {
                if t.id > unknown
                    || t.start >= t.end
                    || t.end > doc.text.len()
                    || !doc.text.is_char_boundary(t.start)
                    || !doc.text.is_char_boundary(t.end)
                {
                    return Err("Invalid token offsets".into());
                }
                ids.push(t.id);
                references.push(Some(Occurrence {
                    document: di,
                    start: t.start,
                    end: t.end,
                }));
                freq[t.id as usize] += 1;
            }
            // Prevent a soft match from crossing document boundaries.
            for _ in 0..12 {
                ids.push(unknown);
                references.push(None);
            }
        }
        if ids.len() > 4_000_000 {
            return Err("Shard exceeds 4 million tokens; use more shards".into());
        }
        let count = ids.len();
        let mut sa: Vec<usize> = (0..count).collect();
        let key = |position: usize| {
            let end = (position + 12).min(count);
            helper::compress(&ids[position..end], 0)
        };
        sa.sort_unstable_by(|a, b| key(*a).cmp(&key(*b)).then(a.cmp(b)));
        let mut bytes = Vec::new();
        let mut rough = Vec::new();
        let mut previous = None;
        for (rank, position) in sa.iter().enumerate() {
            let value = key(*position);
            if rank % 128 == 0 {
                rough.extend_from_slice(&value);
                rough.push((bytes.len() / 32) as u64);
            }
            if rank % 128 == 0 || previous != Some(value) {
                let mut packed = value;
                packed[3] |= (rank % 128) as u64;
                for v in packed {
                    bytes.extend(v.to_le_bytes());
                }
            }
            previous = Some(value);
        }
        rough.extend_from_slice(&[
            u64::MAX,
            u64::MAX,
            u64::MAX,
            u64::MAX,
            (bytes.len() / 32) as u64,
        ]);
        let norm = whitening_norm(model, &freq);
        Ok(Self {
            documents,
            ids,
            references,
            sa,
            index: IndexData { bytes },
            rough,
            norm,
        })
    }
    pub(crate) fn search(
        &self,
        model: &Model,
        query: &[u64],
        scores: &Array2<f32>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Vec<Hit> {
        if self.sa.is_empty() || self.documents.iter().all(|d| d.tokens.is_empty()) {
            return vec![];
        }
        let pat = Array1::from_vec(query.to_vec());
        let rough = Array1::from_vec(self.rough.clone());
        let norm = Array1::from_vec(self.norm.clone());
        let empty = Array1::<u64>::zeros(0);
        let (patterns, values, _, _) = upstream::z_core::compute(
            pat.view(),
            scores.view(),
            rough.view(),
            empty.view(),
            empty.view(),
            norm.view(),
            self.ids.len(),
            self.index.bytes.len() / 32,
            0,
            0,
            128,
            20,
            minimum,
            budget_ms / 1000.,
            &self.index,
        );
        let mut hits = Vec::new();
        let mut seen = BTreeMap::new();
        for (pattern, score) in patterns.into_iter().zip(values) {
            let p: Vec<u32> = pattern.into_iter().map(|v| v as u32).collect();
            let (l, r) = upstream::z_bsearch::get_match_range(
                rough.view(),
                128,
                &p,
                &self.index,
                self.ids.len(),
                self.index.bytes.len() / 32,
            );
            for rank in (l as usize)..(r as usize).min(l as usize + limit) {
                let Some(&position) = self.sa.get(rank) else {
                    continue;
                };
                let Some(Some(first)) = self.references.get(position) else {
                    continue;
                };
                let Some(Some(last)) = self.references.get(position + p.len() - 1) else {
                    continue;
                };
                if first.document != last.document {
                    continue;
                }
                let doc = &self.documents[first.document];
                let line = doc.text[..first.start]
                    .bytes()
                    .filter(|b| *b == b'\n')
                    .count();
                if seen.contains_key(&(first.document, line)) {
                    continue;
                }
                seen.insert((first.document, line), true);
                let left = doc.text[..first.start]
                    .char_indices()
                    .rev()
                    .nth(80)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                let right = doc.text[last.end..]
                    .char_indices()
                    .nth(120)
                    .map(|(i, _)| last.end + i)
                    .unwrap_or(doc.text.len());
                let before = &doc.text[left..first.start];
                let matched = &doc.text[first.start..last.end];
                let a = before.encode_utf16().count();
                let b = a + matched.encode_utf16().count();
                hits.push(Hit {
                    path: doc.path.clone(),
                    line,
                    excerpt: doc.text[left..right].into(),
                    score,
                    match_ranges: vec![[a, b]],
                });
            }
        }
        let _ = model;
        hits
    }
}
fn whitening_norm(model: &Model, freq: &[u64]) -> Vec<f32> {
    let d = model.dimensions;
    let present: Vec<usize> = freq
        .iter()
        .enumerate()
        .filter(|(_, f)| **f > 0)
        .map(|(i, _)| i)
        .collect();
    let mut norms = vec![1e10; model.size];
    let total: f64 = present.iter().map(|i| freq[*i] as f64).sum();
    if total == 0. {
        return norms;
    }
    let mut mean = vec![0.; d];
    for &i in &present {
        let p = freq[i] as f64 / total;
        for j in 0..d {
            mean[j] += p * model.vectors[i * d + j] as f64;
        }
    }
    let centered = DMatrix::from_fn(present.len(), d, |row, j| {
        model.vectors[present[row] * d + j] as f64 - mean[j]
    });
    let weighted = DMatrix::from_fn(present.len(), d, |row, j| {
        centered[(row, j)] * (freq[present[row]] as f64 / total).sqrt()
    });
    let eig = SymmetricEigen::new(weighted.transpose() * weighted);
    let projected = centered * eig.eigenvectors;
    for (row, &id) in present.iter().enumerate() {
        let n = (0..d)
            .map(|j| projected[(row, j)].powi(2) / eig.eigenvalues[j].max(1e-11))
            .sum::<f64>();
        norms[id] = n as f32;
    }
    norms
}

#[derive(Default)]
pub struct PortableIndexRepository {
    pub shards: BTreeMap<String, Shard>,
}
impl crate::application::IndexRepository for PortableIndexRepository {
    fn replace(
        &mut self,
        key: String,
        documents: Vec<Document>,
        model: &Model,
    ) -> Result<(), String> {
        let next = Shard::build(documents, model)?;
        self.shards.insert(key, next);
        Ok(())
    }
    fn search(
        &self,
        model: &Model,
        query: &[u64],
        scores: &Array2<f32>,
        minimum: f32,
        limit: usize,
        budget_ms: f32,
    ) -> Vec<Hit> {
        let start = web_time::Instant::now();
        let mut hits = Vec::new();
        for shard in self.shards.values() {
            let remaining = budget_ms - start.elapsed().as_secs_f32() * 1000.;
            if remaining <= 0. {
                break;
            }
            hits.extend(shard.search(
                model,
                query,
                scores,
                minimum,
                limit,
                remaining / self.shards.len().max(1) as f32,
            ));
        }
        hits
    }
}
