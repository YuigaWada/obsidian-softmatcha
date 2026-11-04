use serde::{Deserialize, Serialize};
/// Platform-independent immutable index bytes. No files, mmap or Python handles.
#[derive(Clone, Serialize, Deserialize)]
pub struct IndexData {
    pub bytes: Vec<u8>,
}
