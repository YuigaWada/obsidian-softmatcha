//! OS-independent search domain and application, with portable index adapters.
pub mod application;
pub mod domain;
mod helper;
pub mod indexing;
mod storage;
mod upstream;
pub use domain::{Document, Hit, Model, Occurrence, Token};
pub use indexing::Shard;
pub type Engine = application::Engine<indexing::PortableIndexRepository>;
#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::Array1;
    fn model() -> Model {
        Model::new(vec![1., 0., 0., 1., 0., 1., -1., 0., 0., 0.], 2).unwrap()
    }
    fn docs() -> Vec<Document> {
        vec![Document {
            path: "日本語.md".into(),
            text: "gold medalist".into(),
            tokens: vec![
                Token {
                    id: 0,
                    start: 0,
                    end: 4,
                },
                Token {
                    id: 2,
                    start: 5,
                    end: 13,
                },
            ],
        }]
    }
    #[test]
    fn soft_substitution() {
        let mut e = Engine::new(model(), indexing::PortableIndexRepository::default());
        e.replace("0".into(), docs()).unwrap();
        let h = e.search(vec![0, 1], 0.7, 20, 500.).unwrap();
        assert!(!h.is_empty());
        assert_eq!(h[0].excerpt, "gold medalist");
        assert_eq!(h[0].match_ranges, vec![[0, 13]]);
    }
    #[test]
    fn exact_range_handles_duplicates() {
        let s = Shard::build(docs(), &model()).unwrap();
        let r = Array1::from_vec(s.rough.clone());
        let range = upstream::z_bsearch::get_match_range(
            r.view(),
            128,
            &[0, 2],
            &s.index,
            s.ids.len(),
            s.index.bytes.len() / 32,
        );
        assert_eq!(range.1 - range.0, 1);
    }
    #[test]
    fn invalid_model_and_query() {
        assert!(Model::new(vec![f32::NAN], 1).is_err());
        let e = Engine::new(model(), indexing::PortableIndexRepository::default());
        assert!(e.search(vec![4], 0.5, 50, 100.).is_err());
    }
}
