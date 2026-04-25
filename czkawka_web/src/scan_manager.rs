use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use czkawka_core::common::progress_data::ProgressData;
use serde_json::Value;
use tokio::sync::{Mutex, broadcast};

/// Status of a single scan session.
#[derive(Clone, Debug)]
pub(crate) enum ScanStatus {
    Running,
    Completed,
    Stopped,
    Failed(String),
}

/// Metadata about a running or completed scan.
pub(crate) struct ScanState {
    pub(crate) status: ScanStatus,
    pub(crate) stop_flag: Arc<AtomicBool>,
    pub(crate) progress_broadcast: broadcast::Sender<ProgressData>,
    pub(crate) result_json: Option<Value>,
}

impl ScanState {
    fn new() -> Self {
        let (progress_broadcast, _) = broadcast::channel(256);
        Self {
            status: ScanStatus::Running,
            stop_flag: Arc::new(AtomicBool::new(false)),
            progress_broadcast,
            result_json: None,
        }
    }
}

/// Central manager for all scan sessions.
pub(crate) struct ScanManager {
    pub(crate) scans: Mutex<HashMap<String, ScanState>>,
}

impl ScanManager {
    pub(crate) fn new() -> Self {
        Self {
            scans: Mutex::new(HashMap::new()),
        }
    }

    /// Creates a new scan session and returns its ID, stop-flag and a progress receiver.
    pub(crate) async fn create_scan(&self) -> (String, Arc<AtomicBool>, broadcast::Receiver<ProgressData>) {
        let id = uuid::Uuid::new_v4().to_string();
        let state = ScanState::new();
        let rx = state.progress_broadcast.subscribe();
        let stop_flag = Arc::clone(&state.stop_flag);

        let mut scans = self.scans.lock().await;
        scans.insert(id.clone(), state);

        (id, stop_flag, rx)
    }

    pub(crate) async fn finish_scan(&self, id: &str, status: ScanStatus, result_json: Option<Value>) {
        let mut scans = self.scans.lock().await;
        if let Some(state) = scans.get_mut(id) {
            state.status = status;
            state.result_json = result_json;
        }
    }

    /// Stop a running scan.
    pub(crate) async fn stop_scan(&self, id: &str) -> bool {
        let mut scans = self.scans.lock().await;
        if let Some(state) = scans.get_mut(id) {
            state.stop_flag.store(true, Ordering::Relaxed);
            state.status = ScanStatus::Stopped;
            true
        } else {
            false
        }
    }

    /// Get scan status.
    pub(crate) async fn get_status(&self, id: &str) -> Option<ScanStatus> {
        let scans = self.scans.lock().await;
        scans.get(id).map(|s| s.status.clone())
    }

    /// Remove a scan.
    pub(crate) async fn remove_scan(&self, id: &str) {
        let mut scans = self.scans.lock().await;
        scans.remove(id);
    }

    /// Subscribe to progress updates for a scan.
    pub(crate) async fn subscribe_progress(&self, id: &str) -> Option<broadcast::Receiver<ProgressData>> {
        let scans = self.scans.lock().await;
        scans.get(id).map(|s| s.progress_broadcast.subscribe())
    }
}
