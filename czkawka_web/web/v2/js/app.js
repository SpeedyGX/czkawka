// Application entry point — wires every module together.

import { $, on } from './util.js';
import { state, initStore, cacheResults, resetViewState } from './store.js';
import { initTheme, cycleTheme, toast } from './ui.js';
import { renderToolTabs, markActiveTab, renderToolOptions } from './tools.js';
import { initDirs } from './dirs.js';
import { initResults, renderResults, showResults, clearResults, detectHardlinks } from './results.js';
import { initScan } from './scan.js';
import { hardlinkOne, hardlinkSelected, deleteSelected } from './actions.js';

function selectTool(toolId) {
    if (state.activeToolId === toolId) return;

    cacheResults(state.activeToolId);
    state.activeToolId = toolId;
    resetViewState();

    markActiveTab();
    renderToolOptions();

    const cached = state.resultsCache[toolId];
    if (cached) {
        state.summary = cached.summary;
        state.groups = cached.groups;
        state.checkingMethod = cached.checkingMethod;
        state.tool = cached.tool;
        state.mode = cached.mode || null;
        state.sourceMap = cached.sourceMap || {};
        detectHardlinks();
        showResults();
    } else {
        clearResults();
    }
}

function boot() {
    initStore();
    initTheme();

    initResults();
    initScan();
    initDirs();

    renderToolTabs(selectTool);
    markActiveTab();
    renderToolOptions();
    clearResults();

    $('#theme-toggle').addEventListener('click', cycleTheme);

    on('action:hardlink', hardlinkOne);
    on('action:hardlink-selected', hardlinkSelected);
    on('action:delete-selected', deleteSelected);

    // Re-render on viewport changes so the responsive layout stays consistent.
    window.addEventListener('resize', () => {
        if (state.groups.length > 0) renderResults();
    });

    toast('Ready \u2014 add a directory and start a scan.', 'info', 4000);
}

boot();
