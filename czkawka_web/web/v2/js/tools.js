// Tool registry, option forms and scan-parameter collection.

import { $, el } from './util.js';
import { state } from './store.js';

export const TOOLS = [
    { id: 'duplicates', name: 'Duplicate Files', endpoint: 'duplicates', optionsTitle: 'Duplicate options' },
    { id: 'images', name: 'Similar Images', endpoint: 'similar-images', optionsTitle: 'Image options' },
    { id: 'videos', name: 'Similar Videos', endpoint: 'similar-videos', optionsTitle: 'Video options' },
];

export function toolById(id) {
    return TOOLS.find((tool) => tool.id === id) || TOOLS[0];
}

export function renderToolTabs(onSelect) {
    const nav = $('#tool-tabs');
    nav.replaceChildren(
        ...TOOLS.map((tool) =>
            el('button', {
                class: 'tool-tab',
                type: 'button',
                role: 'tab',
                dataset: { toolId: tool.id },
                'aria-selected': String(tool.id === state.activeToolId),
                text: tool.name,
                onClick: () => onSelect(tool.id),
            })
        )
    );
}

export function markActiveTab() {
    for (const btn of document.querySelectorAll('#tool-tabs .tool-tab')) {
        btn.setAttribute('aria-selected', String(btn.dataset.toolId === state.activeToolId));
    }
}

// --- Option form helpers ---------------------------------------------

function selectField(labelText, id, options, selectedValue) {
    const select = el('select', { id });
    for (const option of options) {
        select.append(el('option', { value: option.value, text: option.label }));
    }
    select.value = selectedValue;
    return el('label', {}, [`${labelText} `, select]);
}

function numberField(labelText, id, value, attrs = {}) {
    const input = el('input', { type: 'number', id, value: String(value), ...attrs });
    return el('label', {}, [`${labelText} `, input]);
}

function switchField(labelText, id, checked) {
    return el('label', { class: 'switch' }, [
        el('input', { type: 'checkbox', id, checked }),
        el('span', { text: labelText }),
    ]);
}

// --- Option forms -----------------------------------------------------

function renderDuplicatesOptions(container) {
    container.append(
        selectField('Check method:', 'dup-method', [
            { value: 'Hash', label: 'Hash' },
            { value: 'Size', label: 'Size' },
            { value: 'Name', label: 'Name' },
            { value: 'SizeName', label: 'Size and Name' },
        ], 'Hash'),
        selectField('Hash type:', 'dup-hash', [
            { value: 'Blake3', label: 'Blake3' },
            { value: 'CRC32', label: 'CRC32' },
            { value: 'XXH3', label: 'XXH3' },
        ], 'Blake3'),
        switchField('Case sensitive name', 'dup-case-sensitive', false)
    );
}

function renderImagesOptions(container) {
    container.append(
        numberField('Max difference:', 'img-similarity', 10, { min: '0', max: '100' }),
        selectField('Hash size:', 'img-hash-size', [
            { value: '8', label: '8' },
            { value: '16', label: '16' },
            { value: '32', label: '32' },
            { value: '64', label: '64' },
        ], '16'),
        selectField('Resize Algorithm:', 'img-resize-algorithm', [
            { value: 'Lanczos3', label: 'Lanczos3' },
            { value: 'Gaussian', label: 'Gaussian' },
            { value: 'CatmullRom', label: 'CatmullRom' },
            { value: 'Triangle', label: 'Triangle' },
            { value: 'Nearest', label: 'Nearest' },
        ], 'Lanczos3'),
        selectField('Hash Type:', 'img-hash-type', [
            { value: 'Mean', label: 'Mean' },
            { value: 'Gradient', label: 'Gradient' },
            { value: 'BlockHash', label: 'BlockHash' },
            { value: 'VertGradient', label: 'VertGradient' },
            { value: 'DoubleGradient', label: 'DoubleGradient' },
            { value: 'Median', label: 'Median' },
        ], 'Mean'),
        selectField('Geometric invariance:', 'img-geometric-invariance', [
            { value: 'off', label: 'Off' },
            { value: 'mirror_flip', label: 'Mirror + Flip' },
            { value: 'mirror_flip_rotate90', label: 'Mirror + Flip + Rotate 90' },
        ], 'off')
    );
}

function renderVideosOptions(container) {
    const audioToggle = el('input', { type: 'checkbox', id: 'vid-audio' });
    const audioFields = [
        numberField('Audio similarity (%):', 'vid-audio-similarity', 80, { min: '0', max: '100' }),
        numberField('Audio length ratio (0-1):', 'vid-audio-ratio', 0.1, { min: '0', max: '1', step: '0.05' }),
        numberField('Min audio duration (s):', 'vid-audio-duration', 10, { min: '0' }),
        numberField('Max audio difference:', 'vid-audio-difference', 3, { min: '0', step: '0.5' }),
    ];
    const visualFields = [
        numberField('Tolerance:', 'vid-tolerance', 10, { min: '0', max: '20' }),
        numberField('Skip forward (s):', 'vid-skip', 15, { min: '0', max: '300' }),
        numberField('Hash duration (s):', 'vid-hash-duration', 10, { min: '2', max: '60' }),
        selectField('Crop detect:', 'vid-crop', [
            { value: 'Letterbox', label: 'Letterbox' },
            { value: 'None', label: 'None' },
            { value: 'Motion', label: 'Motion' },
        ], 'Letterbox'),
        switchField('Generate thumbnails', 'vid-thumbnails', true),
    ];

    container.append(
        el('label', { class: 'switch' }, [audioToggle, el('span', { text: 'Compare by audio fingerprint' })]),
        ...audioFields,
        ...visualFields
    );

    // Visual and audio comparison share no options, so only one group is visible.
    const syncVisibility = () => {
        const audioMode = audioToggle.checked;
        for (const field of audioFields) field.hidden = !audioMode;
        for (const field of visualFields) field.hidden = audioMode;
    };
    audioToggle.addEventListener('change', syncVisibility);
    syncVisibility();
}

export function renderToolOptions() {
    const container = $('#tool-options');
    const title = $('#tool-options-title');
    if (!container) return;

    container.replaceChildren();
    const tool = toolById(state.activeToolId);
    if (title) title.textContent = tool.optionsTitle;

    if (tool.id === 'duplicates') renderDuplicatesOptions(container);
    else if (tool.id === 'images') renderImagesOptions(container);
    else if (tool.id === 'videos') renderVideosOptions(container);
}

/** Collect the tool-specific part of the scan request body. */
export function collectToolParams() {
    const params = {};
    const id = state.activeToolId;

    if (id === 'duplicates') {
        params.checking_method = $('#dup-method').value;
        params.hash_type = $('#dup-hash').value;
        params.case_sensitive_name = $('#dup-case-sensitive').checked;
    } else if (id === 'images') {
        params.similarity = parseInt($('#img-similarity').value, 10) || 10;
        params.hash_size = parseInt($('#img-hash-size').value, 10) || 16;
        params.hash_alg = $('#img-hash-type').value;
        params.resize_filter = $('#img-resize-algorithm').value;
        params.geometric_invariance = $('#img-geometric-invariance').value;
    } else if (id === 'videos') {
        const audioMode = $('#vid-audio')?.checked ?? false;
        params.check_audio_content = audioMode;
        if (audioMode) {
            params.audio_similarity_percent = parseFloat($('#vid-audio-similarity').value);
            params.audio_length_ratio = parseFloat($('#vid-audio-ratio').value);
            params.audio_min_duration_seconds = parseInt($('#vid-audio-duration').value, 10);
            params.audio_maximum_difference = parseFloat($('#vid-audio-difference').value);
        } else {
            params.tolerance = parseInt($('#vid-tolerance').value, 10) || 10;
            params.skip_forward = parseInt($('#vid-skip').value, 10) || 15;
            params.hash_duration = parseInt($('#vid-hash-duration').value, 10) || 10;
            params.crop_detect = $('#vid-crop')?.value || 'Letterbox';
            params.generate_thumbnails = $('#vid-thumbnails')?.checked ?? true;
        }
    }

    return params;
}
