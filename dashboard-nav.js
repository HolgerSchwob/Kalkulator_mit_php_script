/**
 * View-Wechsel: Liste, Detail, Einstellungen, Tools.
 */

import { TOOL_URLS } from './dashboard-state.js';
import { state } from './dashboard-state.js';

export function showListView() {
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('detailPanel').classList.remove('visible');
    document.getElementById('settingsView').classList.add('hidden');
    document.getElementById('toolsView').classList.add('hidden');
}

export function showToolsView() {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailPanel').classList.remove('visible');
    document.getElementById('settingsView').classList.add('hidden');
    document.getElementById('toolsView').classList.remove('hidden');
    document.getElementById('toolsListWrap').classList.remove('hidden');
    document.getElementById('toolsFrameWrap').classList.add('hidden');
    document.getElementById('toolsFrame').src = '';
}

export function showSettingsView() {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailPanel').classList.remove('visible');
    document.getElementById('toolsView').classList.add('hidden');
    document.getElementById('settingsView').classList.remove('hidden');
}

export function showDetailView() {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailPanel').classList.add('visible');
    document.getElementById('settingsView').classList.add('hidden');
    document.getElementById('toolsView').classList.add('hidden');
}

export function openTool(toolId) {
    const url = TOOL_URLS[toolId];
    if (!url) return;
    const frame = document.getElementById('toolsFrame');
    const wrap = document.getElementById('toolsFrameWrap');
    document.getElementById('toolsListWrap').classList.add('hidden');
    wrap.classList.remove('hidden');
    frame.src = url;

    // Config an Tool-iframe senden (z. B. für Supabase-Palette im SVG-Preflight)
    function sendConfig() {
        try {
            if (frame.contentWindow && state.config && (state.config.supabaseUrl || state.config.adminSecret)) {
                frame.contentWindow.postMessage({
                    type: 'dashboard-tool-config',
                    supabaseUrl: state.config.supabaseUrl || '',
                    anonKey: state.config.anonKey || '',
                    adminSecret: state.config.adminSecret || ''
                }, '*');
            }
        } catch (_) {}
    }
    frame.addEventListener('load', sendConfig, { once: true });
}

export function showToolsList() {
    document.getElementById('toolsListWrap').classList.remove('hidden');
    document.getElementById('toolsFrameWrap').classList.add('hidden');
    document.getElementById('toolsFrame').src = '';
}
