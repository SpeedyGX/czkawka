use std::collections::HashSet;

use crate::common::model::FileEntry;

pub fn filter_hard_links_by_inode(vec_file_entry: Vec<FileEntry>) -> Vec<FileEntry> {
    let mut seen = HashSet::with_capacity(vec_file_entry.len());
    vec_file_entry.into_iter().filter(|fe| fe.inode == 0 || seen.insert(fe.inode)).collect()
}
