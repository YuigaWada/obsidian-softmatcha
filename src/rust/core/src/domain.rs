use ndarray::Array2;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize)]
pub struct Token {
    pub id: u32,
    pub start: usize,
    pub end: usize,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Document {
    pub path: String,
    pub text: String,
    pub tokens: Vec<Token>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Occurrence {
    pub document: usize,
    pub start: usize,
    pub end: usize,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Hit {
    pub path: String,
    pub line: usize,
    pub excerpt: String,
    pub score: f32,
    pub match_ranges: Vec<[usize; 2]>,
}
pub struct Model {
    pub vectors: Vec<f32>,
    pub dimensions: usize,
    pub size: usize,
    lengths: Vec<f32>,
}
impl Model {
    pub fn new(vectors: Vec<f32>, dimensions: usize) -> Result<Self, String> {
        if dimensions == 0
            || vectors.len() % dimensions != 0
            || vectors.len() / dimensions < 2
            || vectors.len() / dimensions > 65536
            || vectors.iter().any(|v| !v.is_finite())
        {
            return Err("Invalid word-vector model".into());
        }
        let size = vectors.len() / dimensions;
        let lengths = vectors
            .chunks_exact(dimensions)
            .map(|v| v.iter().map(|x| x * x).sum::<f32>().sqrt() + 1e-12)
            .collect();
        Ok(Self {
            vectors,
            dimensions,
            size,
            lengths,
        })
    }
    pub(crate) fn scores(&self, query: &[u64]) -> Array2<f32> {
        Array2::from_shape_fn((query.len(), self.size), |(i, j)| {
            let a = query[i] as usize;
            let d = self.dimensions;
            self.vectors[a * d..(a + 1) * d]
                .iter()
                .zip(&self.vectors[j * d..(j + 1) * d])
                .map(|(x, y)| x * y)
                .sum::<f32>()
                / (self.lengths[a] * self.lengths[j])
        })
    }
}
