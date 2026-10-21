// chat-lore.js

import { debouncedRenderFolders } from './lorebook-folders.js';

const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;
const settings = settingsMap[MODULE_NAME];

// ==========================================
// 1. MULTI CHAT LORE
// ==========================================

const CHAT_LORE_ACTIVE_CLASS = 'wip-chat-lore-active';
/** @type {string | null} */
let lastChatId = null;

const CHAT_LORE_ACTIVE_CSS = `
    [data-wip-chat-lore-button="true"].${CHAT_LORE_ACTIVE_CLASS} {
        color: #4caf50 !important;
        border-color: #4caf50 !important;
        box-shadow: 0 0 4px rgba(76, 175, 80, 0.65) !important;
    }

    [data-wip-chat-lore-button="true"].${CHAT_LORE_ACTIVE_CLASS} i,
    [data-wip-chat-lore-button="true"].${CHAT_LORE_ACTIVE_CLASS} span {
        color: #4caf50 !important;
    }
`;

function ensureChatLoreActiveStyle() {
    let style = document.getElementById('wip-chat-lore-active-style');

    if (!style) {
        style = document.createElement('style');
        style.id = 'wip-chat-lore-active-style';
        document.head.appendChild(style);
    }

    // Only re-parses the stylesheet if the content actually changed
    if (style.textContent !== CHAT_LORE_ACTIVE_CSS) {
        style.textContent = CHAT_LORE_ACTIVE_CSS;
    }
}


function getCurrentChatLoreBooks() {
    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;

    if (!currentChatId) return [];

    return settings.chatLorebooks[currentChatId] || [];
}

export function syncNativeChatLoreMetadata() {
    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;

    if (!currentChatId || !context.chatMetadata) return;

    const nativeBook = context.chatMetadata.world_info;

    // If ST already had a real native Chat Lorebook attached, migrates it into multi-chat list.
    if (nativeBook && nativeBook !== 'MULTI_LORE_ACTIVE') {
        if (!settings.chatLorebooks[currentChatId]) {
            settings.chatLorebooks[currentChatId] = [];
        }

        if (!settings.chatLorebooks[currentChatId].includes(nativeBook)) {
            settings.chatLorebooks[currentChatId].push(nativeBook);
            saveSettingsDebounced();
        }
    }

    // IMPORTANT:
    // Never leave MULTI_LORE_ACTIVE, or any other fake value, in native metadata.
    // ST will try to load it as an actual file.
    if (nativeBook) {
        context.chatMetadata.world_info = '';

        if (typeof context.saveMetadata === 'function') {
            context.saveMetadata();
        }
    }
}

/**
 * Cleans values before passing them to #world_info.
 * Prevents blank Select2 chips like an empty item with only an X.
 * @param {any} value
 * @returns {string[]}
 */
export function normalizeWorldInfoValueList(value) {
    const rawArray = Array.isArray(value)
        ? value
        : value
            ? [value]
            : [];

    /** @type {string[]} */
    const cleaned = [];

    rawArray.forEach(v => {
        if (v === null || v === undefined) return;

        const str = String(v);

        // Removes empty values and the old fake metadata marker.
        if (!str || str.trim() === '') return;
        if (str === 'MULTI_LORE_ACTIVE') return;

        if (!cleaned.includes(str)) {
            cleaned.push(str);
        }
    });

    return cleaned;
}


function findAllChatLoreButtons() {
    /** @type {Set<HTMLElement>} */
    const found = new Set();

    /**
     * @param {Element | null} el
     */
    const isBadTarget = (el) => {
        if (!el) return true;

        return Boolean(el.closest(`
            #toast-container,
            .toast,
            .toast-success,
            .toast-info,
            .toast-warning,
            .toast-error,
            .toast-title,
            .toast-message,
            .toastr,
            .toast-close-button,
            .popup,
            .popup-content,
            .popup-body,
            .popup-controls,
            .dialogue_popup,
            .dialogue_popup_holder
        `));
    };

    /**
     * @param {Element} el
     * @returns {HTMLElement | null}
     */
    const normalizeToButton = (el) => {
        if (isBadTarget(el)) return null;

        const htmlEl = /** @type {HTMLElement} */ (el);

        const button = htmlEl.matches('.menu_button, .char_action_button, .interactable, button')
            ? htmlEl
            : htmlEl.closest('.menu_button, .char_action_button, .interactable, button');

        if (!button || isBadTarget(button)) return null;

        return /** @type {HTMLElement} */ (button);
    };

    const selectors = [
        '#chat_lore',
        '#chat_lore_button',
        '#chat_lorebook_button',
        '[data-i18n="Chat lore" i]',
        '[data-i18n="Chat Lore" i]',
        '[data-i18n="Chat Lore Book" i]',
        '[title*="Chat lore" i]',
        '[title*="Chat Lore" i]',
        '[aria-label*="Chat lore" i]',
        '[aria-label*="Chat Lore" i]',
    ];

    document.querySelectorAll(selectors.join(',')).forEach(el => {
        const button = normalizeToButton(el);
        if (button) found.add(button);
    });

    // Fallback: broad search, but with strict matching and toast/popup exclusion.
    document.querySelectorAll('.menu_button, .char_action_button, .interactable, button').forEach(el => {
        if (isBadTarget(el)) return;

        const htmlEl = /** @type {HTMLElement} */ (el);

        const text = (htmlEl.textContent || '').trim().toLowerCase();
        const title = (htmlEl.title || '').trim().toLowerCase();
        const aria = (htmlEl.getAttribute('aria-label') || '').trim().toLowerCase();
        const i18n = (htmlEl.getAttribute('data-i18n') || '').trim().toLowerCase();

        const haystack = [text, title, aria, i18n].join(' ');

        const looksLikeActualChatLoreButton =
            text === 'chat lore' ||
            text === 'chat lore book' ||
            title.startsWith('chat lore:') ||
            title === 'chat lore' ||
            title === 'chat lore book' ||
            aria === 'chat lore' ||
            aria === 'chat lore book' ||
            i18n === 'chat lore' ||
            i18n === 'chat lore book' ||
            haystack.includes('attach multiple lorebooks to this chat');

        // Explicitly rejects toastr text/title variants.
        const looksLikeToastMessage =
            haystack.includes('chat lore saved') ||
            haystack.includes('lorebook(s) to this chat') ||
            haystack.includes('linked ') && haystack.includes(' lorebook');

        if (looksLikeActualChatLoreButton && !looksLikeToastMessage) {
            found.add(htmlEl);
        }
    });

    return Array.from(found);
}

function applyChatLoreButtonState() {
    ensureChatLoreActiveStyle();
    syncNativeChatLoreMetadata();

    const linkedBooks = getCurrentChatLoreBooks();
    const isActive = linkedBooks.length > 0;

    const buttons = findAllChatLoreButtons();

    buttons.forEach(btnElement => {
        btnElement.setAttribute('data-wip-chat-lore-button', 'true');
        btnElement.classList.toggle('success', isActive);
        btnElement.classList.toggle(CHAT_LORE_ACTIVE_CLASS, isActive);

        btnElement.title = isActive
            ? `Chat Lore: ${linkedBooks.length} attached`
            : 'Chat Lore: Attach multiple Lorebooks to this Chat';
    });
}

/** @type {ReturnType<typeof setTimeout>[]} */
let buttonStateTimers = [];

export function forceApplyChatLoreButtonStateSoon() {
    // Cancels any pending updates so repeated calls don't stack duplicates
    buttonStateTimers.forEach(t => clearTimeout(t));
    buttonStateTimers = [];

    [0, 50, 150, 300].forEach(delay => {
        buttonStateTimers.push(setTimeout(applyChatLoreButtonState, delay));
    });
}

/**
 * Resolves a lorebook display name to the value expected by #world_info.
 * Falls back to the book name, but never returns blank.
 * @param {string} bookName
 * @returns {string}
 */
function getGlobalLorebookValue(bookName) {
    const cleanName = String(bookName || '').trim();
    if (!cleanName) return '';

    const globalSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('world_info'));

    if (globalSelect) {
        const matchingOption = Array.from(globalSelect.options).find(opt => {
            const optValue = String(opt.value || '').trim();
            const optText = String(opt.text || '').trim();

            if (!optValue && !optText) return false;

            return optValue === cleanName || optText === cleanName;
        });

        if (matchingOption) {
            const value = String(matchingOption.value || '').trim();

            // Never return an empty option value.
            if (value) return value;
        }
    }

    return cleanName;
}

/**
 * Removes a lorebook from the active world list by either display name or option value.
 * @param {string[]} activeList
 * @param {string} bookName
 * @returns {string[]}
 */
function removeLorebookFromActiveList(activeList, bookName) {
    const bookValue = getGlobalLorebookValue(bookName);

    return activeList.filter(v => v !== bookName && v !== bookValue);
}

export function cleanupBlankGlobalWorldInfoSelection() {
    // @ts-ignore
    const globalSelect = $('#world_info');
    if (!globalSelect || !globalSelect.length) return;

    const cleaned = normalizeWorldInfoValueList(globalSelect.val());

    // @ts-ignore
    globalSelect.val(cleaned).trigger('change');
}

export function hijackNativeChatLoreButton() {
    const buttons = findAllChatLoreButtons();

    buttons.forEach(btnElement => {
        if (!btnElement.hasAttribute('data-multi-hijacked')) {
            btnElement.setAttribute('data-multi-hijacked', 'true');

            btnElement.addEventListener('click', (/** @type {MouseEvent} */ e) => {
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
                openMultiChatLoreMenu();
            }, true);
        }
    });

    forceApplyChatLoreButtonStateSoon();
}

async function openMultiChatLoreMenu() {
    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;

    if (!currentChatId) {
        // @ts-ignore
        return toastr.warning("Please open a chat first!");
    }

    const worldSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
    if (!worldSelect) return;

    const availableBooks = Array.from(worldSelect.options).filter(o => o.value !== '').map(o => o.text);
    const linkedBooks = settings.chatLorebooks[currentChatId] || [];

    // Tracks checkbox state globally so data isn't lost when the popup closes
    // @ts-ignore
    window.tempChatLoreSelection = [...linkedBooks];

    // @ts-ignore
    window.toggleMultiChatLore = (b64Book, isChecked, el) => {
        const bookName = decodeURIComponent(atob(b64Book));

        // @ts-ignore
        if (isChecked) {
            // @ts-ignore
            if (!window.tempChatLoreSelection.includes(bookName)) window.tempChatLoreSelection.push(bookName);
        } else {
            // @ts-ignore
            window.tempChatLoreSelection = window.tempChatLoreSelection.filter(b => b !== bookName);
        }

        // Live-updates this folder's badge AND every ancestor's, since subtree
        // counts ripple upward when a nested checkbox changes
        if (el && el instanceof HTMLElement) {
            let folderDetails = /** @type {HTMLElement | null} */ (el.closest('details.wip-chat-lore-folder'));

            while (folderDetails) {
                // :scope > summary grabs THIS folder's own badge, never a subfolder's
                const badge = folderDetails.querySelector(':scope > summary .wip-folder-count');

                // Subtree = ALL checkboxes inside this details, subfolders' included
                const boxes = Array.from(folderDetails.querySelectorAll('input[type="checkbox"]'));

                if (badge && boxes.length > 0) {
                    const checkedCount = boxes.filter(/** @param {Element} cb */ cb => /** @type {HTMLInputElement} */ (cb).checked).length;
                    badge.textContent = ` (${checkedCount}/${boxes.length})`;
                }

                // Steps to the next enclosing folder in the nested chain
                const parentEl = folderDetails.parentElement;
                folderDetails = parentEl ? /** @type {HTMLElement | null} */ (parentEl.closest('details.wip-chat-lore-folder')) : null;
            }
        }
    };


    // Builds the folder-grouped checklist UI (mirrors the Tag Folders panel and nested!)
    const sortBooks = (/** @type {string[]} */ arr) =>
        arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

    const sortNames = (/** @type {string[]} */ arr) =>
        arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

    /** @type {Set<string>} */
    const assignedLorebooks = new Set();

    /**
     * @param {string} name
     * @returns {string}
     */
    const buildBookCheckbox = (name) => {
        const isChecked = linkedBooks.includes(name) ? 'checked' : '';
        const b64Book = btoa(encodeURIComponent(name));

        return `
            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" class="multi-chat-lore-cb" onchange="window.toggleMultiChatLore('${b64Book}', this.checked, this)" ${isChecked}>
                <span>${name}</span>
            </label>
        `;
    };

    // --- FOLDER TREE: flat "Parent/Child" keys become nested nodes ---
    /** @type {any} */
    const rootNode = { name: '', children: {}, books: [] };

    /**
     * @param {string} keyPath
     * @returns {any}
     */
    const getNode = (keyPath) => {
        /** @type {any} */
        let node = rootNode;
        for (const segment of keyPath.split('/')) {
            if (!node.children[segment]) {
                node.children[segment] = { name: segment, children: {}, books: [] };
            }
            node = node.children[segment];
        }
        return node;
    };

    // Populates every folder node with its existing, sorted lorebooks
    Object.keys(settings.folders).forEach(/** @param {string} keyPath */ keyPath => {
        const node = getNode(keyPath);

        /** @type {string[]} */
        const booksInFolder = (settings.folders[keyPath] || [])
            .map(/** @param {string} name */ name => availableBooks.find(b => b === name))
            .filter(/** @param {any} b */ b => b !== undefined);

        sortBooks(booksInFolder);
        booksInFolder.forEach(/** @param {string} b */ b => { node.books.push(b); assignedLorebooks.add(b); });
    });

    /**
     * Counts linked books in this node's ENTIRE subtree (self + descendants).
     * Used only for auto-open - badges stay direct-only.
     * @param {any} node
     * @returns {number}
     */
    const subtreeCheckedCount = (node) => {
        let count = node.books.filter(/** @param {string} b */ b => linkedBooks.includes(b)).length;
        Object.values(node.children).forEach(/** @param {any} child */ child => { count += subtreeCheckedCount(child); });
        return count;
    };

    /**
     * Counts ALL books (linked or not) in this node's entire subtree.
     * @param {any} node
     * @returns {number}
     */
    const subtreeBookCount = (node) => {
        let count = node.books.length;
        Object.values(node.children).forEach(/** @param {any} child */ child => { count += subtreeBookCount(child); });
        return count;
    };

    /**
     * @param {any} node
     * @returns {string}
     */
    const renderNode = (node) => {
        // Subtree-aware badges: count everything inside, subfolders included
        const checkedCount = subtreeCheckedCount(node);
        const totalCount = subtreeBookCount(node);
        const isOpen = checkedCount > 0 ? ' open' : '';
        const countBadge = totalCount > 0
            ? `<span class="wip-folder-count" style="opacity: 0.6; font-size: 0.85em;"> (${checkedCount}/${totalCount})</span>`
            : '';

        let section = `<details class="wip-chat-lore-folder" style="margin-bottom: 8px; border: 1px solid var(--SmartThemeBorderColor, #555); border-radius: 5px; padding: 5px;"${isOpen}>`;
        section += `<summary style="cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px; padding: 3px;">`;
        section += `<i class="fa-solid fa-folder"></i> <span>${node.name}</span>${countBadge}`;
        section += `</summary>`;
        section += `<div style="margin-top: 5px; padding-left: 10px;">`;

        // Subfolders stack on top (alphabetical), matching the main panel
        sortNames(Object.keys(node.children)).forEach(/** @param {string} childName */ childName => {
            section += renderNode(node.children[childName]);
        });

        if (node.books.length === 0 && Object.keys(node.children).length === 0) {
            section += `<div style="opacity: 0.5; font-style: italic; padding-left: 5px;">Empty folder...</div>`;
        } else {
            node.books.forEach(/** @param {string} b */ b => { section += buildBookCheckbox(b); });
        }

        section += `</div></details>`;
        return section;
    };

    let html = `<div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px;">`;
    html += `<div style="margin-bottom: 15px; font-size: 0.9em; opacity: 0.8;">Select multiple lorebooks to automatically load when this specific chat is opened. Folders mirror your Tag Folders.</div>`;

    // Root folders (alphabetical)
    sortNames(Object.keys(rootNode.children)).forEach(/** @param {string} folderName */ folderName => {
        html += renderNode(rootNode.children[folderName]);
    });

    // Uncategorized last, mirroring the panel
    const uncategorizedBooks = availableBooks.filter(/** @param {string} b */ b => !assignedLorebooks.has(b));
    sortBooks(uncategorizedBooks);

    html += renderNode({ name: 'Uncategorized', children: {}, books: uncategorizedBooks });

    html += `</div>`;

    const { Popup } = context;
    if (!Popup) return alert("Error: SillyTavern Popup module not found. Please update SillyTavern.");

    // @ts-ignore
    const confirmed = await Popup.show.confirm('Multi Chat Lore', html, { okButton: 'Save', cancelButton: 'Cancel' });

    if (confirmed) {
        // @ts-ignore
        const newLinked = window.tempChatLoreSelection || [];

        /** @type {string[]} */
        const oldLinked = settings.chatLorebooks[currentChatId] || [];
        const removedBooks = oldLinked.filter(b => !newLinked.includes(b));

        settings.chatLorebooks[currentChatId] = newLinked;
        saveSettingsDebounced();

        // Immediately updates native metadata and the visible Chat Lore button.
        syncNativeChatLoreMetadata();
        applyChatLoreButtonState();
        forceApplyChatLoreButtonStateSoon();

        // @ts-ignore
        const globalSelect = $('#world_info');
        const rawVal = globalSelect.val();
        /** @type {string[]} */
        let currentActive = normalizeWorldInfoValueList(rawVal);

        removedBooks.forEach(/** @param {string} bookName */ bookName => {
            currentActive = removeLorebookFromActiveList(currentActive, bookName);
        });

        newLinked.forEach(/** @param {string} bookName */ bookName => {
            const bookValue = getGlobalLorebookValue(bookName);

            if (bookValue && !currentActive.includes(bookValue)) {
                currentActive.push(bookValue);
            }
        });

        // @ts-ignore
        globalSelect.val(currentActive).trigger('change');
        scheduleHideChatLoreFromGlobalUI();

        debouncedRenderFolders();

        renderChatLoreField();
        hijackNativeChatLoreButton();

        // @ts-ignore
        toastr.success(`Linked ${newLinked.length} lorebook(s) to this chat!`, 'Chat Lore Saved');
    }
}

export function syncChatLorebooks() {
    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;

    if (!currentChatId || currentChatId === lastChatId) {
        lastChatId = currentChatId || null;
        syncNativeChatLoreMetadata();
        renderChatLoreField();
        hijackNativeChatLoreButton();
        return;
    }

    // @ts-ignore
    const globalSelect = $('#world_info');
    const rawVal = globalSelect.val();
    /** @type {string[]} */
    let currentActive = normalizeWorldInfoValueList(rawVal);

    if (lastChatId && settings.chatLorebooks[lastChatId]) {
        const oldBooks = settings.chatLorebooks[lastChatId];

        oldBooks.forEach(/** @param {string} bookName */ bookName => {
            currentActive = removeLorebookFromActiveList(currentActive, bookName);
        });
    }

    const newBooks = settings.chatLorebooks[currentChatId] || [];

    newBooks.forEach(/** @param {string} bookName */ bookName => {
        const bookValue = getGlobalLorebookValue(bookName);

        if (bookValue && !currentActive.includes(bookValue)) {
            currentActive.push(bookValue);
        }
    });


    // @ts-ignore
    globalSelect.val(currentActive).trigger('change');
    scheduleHideChatLoreFromGlobalUI();

    debouncedRenderFolders();

    lastChatId = currentChatId;
    syncNativeChatLoreMetadata();
    renderChatLoreField();
    hijackNativeChatLoreButton();
}

// ==========================================
// 2. CHAT LORE UI SEPARATION
// ==========================================

// @ts-ignore
window.removeChatLore = (b64Book) => {
    // Decode the Base64 payload back into the original lorebook name
    const bookName = decodeURIComponent(atob(b64Book));

    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;
    if (!currentChatId || !settings.chatLorebooks[currentChatId]) return;

    settings.chatLorebooks[currentChatId] = settings.chatLorebooks[currentChatId].filter(/** @param {string} b */ b => b !== bookName);
    saveSettingsDebounced();

    // @ts-ignore
    const globalSelect = $('#world_info');
    const rawVal = globalSelect.val();
    /** @type {string[]} */
    let currentActive = normalizeWorldInfoValueList(rawVal);

    currentActive = removeLorebookFromActiveList(currentActive, bookName);

    // @ts-ignore
    globalSelect.val(currentActive).trigger('change');
    scheduleHideChatLoreFromGlobalUI();

    debouncedRenderFolders();
    syncNativeChatLoreMetadata();
    renderChatLoreField();
    hijackNativeChatLoreButton();
};

export function renderChatLoreField() {
    const globalSelector = document.getElementById('WIMultiSelector');
    if (!globalSelector) return;

    let chatField = document.getElementById('custom-chat-lore-field');
    if (!chatField) {
        chatField = document.createElement('div');
        chatField.id = 'custom-chat-lore-field';

        chatField.style.marginTop = '10px';
        chatField.style.width = '100%';
        globalSelector.appendChild(chatField);
    }

    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;
    /** @type {string[]} */
    const linkedBooks = (currentChatId && settings.chatLorebooks[currentChatId]) ? settings.chatLorebooks[currentChatId] : [];

    let html = `
        <div class="range-block-title justifyLeft">
            <span><small>Active World(s) for <b>this</b> chat</small></span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 5px; padding: 5px; border: 1px solid var(--SmartThemeBorderColor, #555); border-radius: 5px; min-height: 32px; align-items: center; background: var(--black30a, rgba(0,0,0,0.3));">
    `;

    if (!currentChatId) {
        html += `<span style="opacity: 0.5; font-size: 0.9em; padding-left: 5px;">No chat open.</span>`;
    } else if (linkedBooks.length === 0) {
        html += `<span style="opacity: 0.5; font-size: 0.9em; padding-left: 5px;">None attached. Use the Chat Lore button!</span>`;
    } else {
        linkedBooks.forEach(book => {
            // Encodes the book name in Base64 so quotes/newlines can never break the inline handler
            const b64Book = btoa(encodeURIComponent(book));
            html += `
                <div style="background-color: var(--SmartThemeBlurTintColor, rgba(255,255,255,0.1)); border: 1px solid var(--SmartThemeBorderColor, #555); border-radius: 3px; padding: 2px 8px; font-size: 0.9em; display: flex; align-items: center; gap: 8px;">
                    <span>${book}</span>
                    <i class="fa-solid fa-xmark interactable" style="cursor: pointer; color: var(--red);" onclick="window.removeChatLore('${b64Book}')" title="Remove from this chat"></i>
                </div>
            `;
        });
    }

    html += `</div>`;
    chatField.innerHTML = html;
    hideChatLoreFromGlobalUI();
}

function hideChatLoreFromGlobalUI() {
    const context = SillyTavern.getContext();
    const currentChatId = context.chatId;

    /** @type {string[]} */
    const linkedBooks = currentChatId && settings.chatLorebooks[currentChatId]
        ? settings.chatLorebooks[currentChatId]
        : [];

    const globalSelector = document.getElementById('WIMultiSelector');
    const globalContainer = document.querySelector('#WIMultiSelector .select2-selection__rendered');

    if (!globalSelector || !globalContainer) return;

    // Hoists the option lookups: query both selects ONCE per render
    const optionPairs = ['world_info', 'world_editor_select'].flatMap(id => {
        const select = /** @type {HTMLSelectElement | null} */ (document.getElementById(id));
        if (!select) return [];
        return Array.from(select.options).map(opt => ({
            value: String(opt.value || '').trim(),
            text: String(opt.text || '').trim(),
        }));
    });

    // Builds a single combined alias set for ALL linked chat lorebooks (once)
    /** @type {Set<string>} */
    const chatLoreAliases = new Set();

    linkedBooks.forEach(bookName => {
        const cleanName = String(bookName || '').trim();
        if (cleanName) chatLoreAliases.add(cleanName);

        optionPairs.forEach(({ value, text }) => {
            if (value === cleanName || text === cleanName) {
                if (value) chatLoreAliases.add(value);
                if (text) chatLoreAliases.add(text);
            }
        });
    });

    /**
     * @param {string} valueOrTitle
     * @returns {boolean}
     */
    const isCurrentChatLore = (valueOrTitle) => {
        const clean = String(valueOrTitle || '').trim();
        if (!clean) return false;
        return chatLoreAliases.has(clean);
    };

    /**
     * Gets visible chip label without the Select2 remove button text.
     * @param {Element} li
     */
    const getChoiceLabel = (li) => {
        const clone = /** @type {HTMLElement} */ (li.cloneNode(true));

        clone.querySelectorAll('.select2-selection__choice__remove').forEach(el => {
            el.remove();
        });


        return String(clone.textContent || '')
            .replace('×', '')
            .trim();
    };

    // Determines whether any selected global lorebook is NOT one of the hidden chat lorebooks.
    // If none are visible, also hides Select2's leftover clear X.
    // @ts-ignore
    const globalSelect = $('#world_info');
    const rawVal = globalSelect.val();

    /** @type {string[]} */
    const activeValues = normalizeWorldInfoValueList(rawVal);

    const nonChatLoreActiveValues = activeValues.filter(v => !isCurrentChatLore(v));

    const choices = Array.from(globalContainer.querySelectorAll('li.select2-selection__choice'));

    choices.forEach(li => {
        const htmlLi = /** @type {HTMLElement} */ (li);

        const title = String(li.getAttribute('title') || '').trim();
        const label = getChoiceLabel(li);

        const isChatLoreChoice =
            isCurrentChatLore(title) ||
            isCurrentChatLore(label);

        const isVisuallyEmptyChoice =
            !title &&
            !label;

        if (isChatLoreChoice || isVisuallyEmptyChoice) {
            htmlLi.style.setProperty('display', 'none', 'important');
        } else {
            htmlLi.style.removeProperty('display');
        }
    });

    const shouldHideClearButton = linkedBooks.length > 0 && nonChatLoreActiveValues.length === 0;

    globalSelector.querySelectorAll('.select2-selection__clear').forEach(clearBtn => {
        if (shouldHideClearButton) {
            /** @type {HTMLElement} */ (clearBtn).style.setProperty('display', 'none', 'important');
        } else {
            /** @type {HTMLElement} */ (clearBtn).style.removeProperty('display');
        }
    });
}

/** @type {ReturnType<typeof setTimeout>[]} */
let hideTimers = [];

export function scheduleHideChatLoreFromGlobalUI() {
    hideTimers.forEach(t => clearTimeout(t));
    hideTimers = [];

    [0, 50, 150, 300].forEach(delay => {
        hideTimers.push(setTimeout(hideChatLoreFromGlobalUI, delay));
    });
}