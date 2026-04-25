use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use slint::{ComponentHandle, ModelRc, VecModel};

use crate::simpler_model::{SimplerSingleMainListModel, ToSimplerVec, ToSlintModel};
use crate::{ActiveTab, Callabler, GuiState, MainWindow, SingleMainListModel};

/// Cache of unfiltered full models per active tab (as Send-safe simplified models).
/// Limited to at most 2 entries to prevent unbounded memory growth when switching tabs.
const FILTER_CACHE_MAX_ENTRIES: usize = 2;
/// Tracks the order in which tabs were cached (most recent first) for LRU eviction.
static FILTER_CACHE_ORDER: LazyLock<Mutex<Vec<ActiveTab>>> = LazyLock::new(|| Mutex::new(Vec::new()));
static FILTER_CACHE: LazyLock<Mutex<HashMap<ActiveTab, Vec<SimplerSingleMainListModel>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Registers the `on_filter_results` callback.
pub(crate) fn connect_filter(app: &MainWindow) {
    let a = app.as_weak();
    app.global::<Callabler>().on_filter_results(move |filter_text, column_idx| {
        let app = a.upgrade().expect("Failed to upgrade app in filter_results");
        let active_tab = app.global::<GuiState>().get_active_tab();
        let column_idx = column_idx as usize;

        // Tools without grouped data: skip filtering (Settings, About)
        if matches!(active_tab, ActiveTab::Settings | ActiveTab::About) {
            return;
        }

        // If filter is empty, restore from cache
        if filter_text.is_empty() {
            if let Ok(cache) = FILTER_CACHE.lock() {
                if let Some(cached) = cache.get(&active_tab) {
                    let restored: Vec<SingleMainListModel> = cached.iter().map(|s| s.clone().into()).collect();
                    active_tab.set_tool_model(&app, ModelRc::new(VecModel::from(restored)));
                    return;
                }
            }
            return;
        }

        // Determine which val_str index to filter by
        let filter_idx = if column_idx == 0 {
            // File Name
            active_tab.get_str_name_idx()
        } else {
            // Path
            active_tab.get_str_path_idx()
        };

        let filter_lower = filter_text.to_lowercase();

        // Cache the current (unfiltered) model if not already cached (LRU eviction)
        {
            let mut cache = FILTER_CACHE.lock().expect("FILTER_CACHE mutex poisoned");
            if !cache.contains_key(&active_tab) {
                // Evict oldest entry when at capacity
                if cache.len() >= FILTER_CACHE_MAX_ENTRIES {
                    if let Ok(mut order) = FILTER_CACHE_ORDER.lock() {
                        if let Some(oldest) = order.pop() {
                            cache.remove(&oldest);
                        }
                    }
                }
                let all_items: Vec<SimplerSingleMainListModel> = active_tab
                    .get_tool_model(&app)
                    .to_simpler_enumerated_vec()
                    .into_iter()
                    .map(|(_, item)| item)
                    .collect();
                cache.insert(active_tab, all_items);
            }
            // Update LRU order: move to front (most recently used)
            if let Ok(mut order) = FILTER_CACHE_ORDER.lock() {
                order.retain(|t| *t != active_tab);
                order.push(active_tab);
            }
        }

        // Apply filter using cached data
        let cache = FILTER_CACHE.lock().expect("FILTER_CACHE mutex poisoned");
        if let Some(all_items) = cache.get(&active_tab) {
            let filtered: Vec<SimplerSingleMainListModel> = all_items
                .iter()
                .filter(|item| {
                    // Always keep header rows
                    if item.header_row {
                        return true;
                    }
                    // Filter by the selected column
                    item.val_str
                        .iter()
                        .nth(filter_idx)
                        .is_some_and(|val| val.to_lowercase().contains(&filter_lower))
                })
                .cloned()
                .collect();

            let filtered_model = ModelRc::new(VecModel::from(filtered.to_vec_model()));
            active_tab.set_tool_model(&app, filtered_model);
        }
    });
}

/// Clears the filter cache for a given tab (called when new scan data is loaded).
#[expect(dead_code, reason = "Available for use when scan data is reloaded")]
pub(crate) fn clear_filter_cache(active_tab: ActiveTab) {
    if let Ok(mut cache) = FILTER_CACHE.lock() {
        cache.remove(&active_tab);
    }
    if let Ok(mut order) = FILTER_CACHE_ORDER.lock() {
        order.retain(|t| *t != active_tab);
    }
}
