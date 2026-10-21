// lorebook-folders.js

import { getLorebookData } from './uid-editor.js';

const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;
const settings = settingsMap[MODULE_NAME];

// Bulk Selection Mode
let isSelectionMode = false;
/** @type {Set<string>} */
const selectedBooks = new Set();

/**
 * Refreshes the bulk action bar's count and button disabled states.
 * Called on every checkbox change without a full re-render.
 */
function updateBulkBar() {
    const bar = document.getElementById('wip-bulk-bar');
    if (!bar) return;

    const count = /** @type {HTMLElement} */ (bar.querySelector('.wip-bulk-count'));
    if (count) count.textContent = `${selectedBooks.size} selected`;

    // Live-updates "Move # to..." so the label never lies about the batch size
    const ph = bar.querySelector('.wip-bulk-move-placeholder');
    if (ph) ph.textContent = `Move ${selectedBooks.size} to...`;

    bar.querySelectorAll('[data-bulk-action]').forEach(el => {
        const ctl = /** @type {HTMLButtonElement | HTMLSelectElement} */ (el);
        ctl.disabled = selectedBooks.size === 0;
    });
}

// Cache for Auto-Rename Detection
/** @type {Array<{value: string, text: string}>} */
let lastAvailableBooks = [];

// Performance Debouncer for folder rendering
/** @type {ReturnType<typeof setTimeout> | undefined} */
let folderRenderDebounce;

export function syncFolderHighlighting() {
    const worldSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
    if (!worldSelect) return;

    const activeVal = worldSelect.value;
    document.querySelectorAll('.folder-item').forEach(item => {
        const nameClick = /** @type {HTMLElement} */ (item.querySelector('.book-name-click'));
        if (!nameClick) return;

        // Checks new data attribute to see if it matches the native dropdown
        if (item.getAttribute('data-book-val') === activeVal) {
            nameClick.style.fontWeight = 'bold';
        } else {
            nameClick.style.fontWeight = 'normal';
        }
    });
}

export function debouncedRenderFolders() {
    clearTimeout(folderRenderDebounce);
    folderRenderDebounce = setTimeout(() => renderFolders(), 50);
}

/**
 * Adds a toolbar button that moves the currently edited lorebook into a folder,
 * so users don't have to scroll the Tag Folders list hunting for it.
 */
export function injectMoveToFolderButton() {
    if (document.getElementById('move-to-folder-btn')) return;

    const openAllBtn = document.getElementById('OpenAllWIEntries');
    if (!openAllBtn || !openAllBtn.parentNode) return;

    const moveBtn = document.createElement('div');
    moveBtn.id = 'move-to-folder-btn';
    moveBtn.className = 'menu_button interactable fa-solid fa-arrow-right-to-bracket';
    moveBtn.title = 'Move this lorebook into a folder';

    moveBtn.addEventListener('click', async () => {
        const worldSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
        if (!worldSelect || !worldSelect.value) {
            // @ts-ignore
            return toastr.warning('No lorebook selected!');
        }

        const bookName = worldSelect.options[worldSelect.selectedIndex].text;

        const folderNames = Object.keys(settings.folders).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        );

        // Find the book's current folder (if any)
        /** @type {string} */
        let currentFolder = 'Uncategorized';
        for (const f in settings.folders) {
            if (settings.folders[f].includes(bookName)) { currentFolder = f; break; }
        }

        // @ts-ignore
        window.tempFolderMoveTarget = currentFolder;

        let html = `<div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px;">`;
        html += `<div style="margin-bottom: 15px; font-size: 0.9em; opacity: 0.8;">Move <b>${bookName}</b> to which folder?</div>`;

        html += `<select onchange="window.tempFolderMoveTarget = this.value" class="text_pole" style="width: 100%; padding: 6px;">`;
        ['Uncategorized', ...folderNames].forEach(/** @param {string} folder */ folder => {
            const selected = folder === currentFolder ? ' selected' : '';
            const safeFolder = folder.replace(/"/g, '&quot;');
            html += `<option value="${safeFolder}"${selected}>${folder}</option>`;
        });
        html += `</select></div>`;

        const { Popup } = SillyTavern.getContext();
        if (!Popup) return alert('Popup module not found.');

        // @ts-ignore
        const confirmed = await Popup.show.confirm('Move to Folder', html, { okButton: 'Move', cancelButton: 'Cancel' });

        if (confirmed) {
            // @ts-ignore
            const target = window.tempFolderMoveTarget;
            if (!target) return;

            // Remove from all folders first
            for (const f in settings.folders) {
                settings.folders[f] = settings.folders[f].filter(/** @param {string} b */ b => b !== bookName);
            }

            if (target !== 'Uncategorized') {
                if (!settings.folders[target]) settings.folders[target] = [];
                settings.folders[target].push(bookName);
            }

            saveSettingsDebounced();
            debouncedRenderFolders();

            // @ts-ignore
            toastr.success(`Moved "${bookName}" to "${target}".`, 'Folder Updated');
        }
    });

    // Anchor after the Link Profile button, else after Re-index, else fallback
    const linkBtn = document.getElementById('link-profile-btn');
    const reindexBtn = document.getElementById('reindex-uids-btn');

    if (linkBtn && linkBtn.parentNode) {
        linkBtn.parentNode.insertBefore(moveBtn, linkBtn.nextSibling);
    } else if (reindexBtn && reindexBtn.parentNode) {
        reindexBtn.parentNode.insertBefore(moveBtn, reindexBtn.nextSibling);
    } else {
        const applyOrderBtn = openAllBtn.parentNode.querySelector('.fa-sort-numeric-down, [title*="Order" i], [title*="sorting" i]');
        if (applyOrderBtn && applyOrderBtn.parentNode) {
            applyOrderBtn.parentNode.insertBefore(moveBtn, applyOrderBtn.nextSibling);
        } else {
            openAllBtn.parentNode.appendChild(moveBtn);
        }
    }
}

// ==========================================
// FOLDER RENDERER
// ==========================================

export function renderFolders() {
    const worldSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
    if (!worldSelect || !worldSelect.parentNode) return;

    let masterDetails = /** @type {HTMLDetailsElement} */ (document.getElementById('world-info-folders-master'));
    let customContainer = /** @type {HTMLElement} */ (document.getElementById('custom-world-folder-container'));

    if (!masterDetails || !customContainer) {
        if (masterDetails) masterDetails.remove();

        masterDetails = document.createElement('details');
        masterDetails.id = 'world-info-folders-master';
        masterDetails.className = 'inline-drawer';
        masterDetails.style.marginTop = '10px';

        if (settings.masterOpen !== false) masterDetails.open = true;
        masterDetails.addEventListener('toggle', () => {
            settings.masterOpen = masterDetails.open;
            saveSettingsDebounced();
        });

        const masterSummary = document.createElement('summary');
        masterSummary.innerHTML = `
            <b><i class="fa-solid fa-folder-tree"></i> Tag Folders</b>
            <div class="bulk-select-btn" title="Bulk Select Books" style="opacity: 0.7; padding: 0 5px; margin-left: 8px; transition: color 0.2s;">
                <i class="fa-solid fa-list-check"></i>
            </div>
        `;
        masterSummary.style.display = 'flex';
        masterSummary.style.alignItems = 'center';
        masterSummary.style.cursor = 'pointer';
        masterSummary.style.padding = '8px';
        masterSummary.style.backgroundColor = 'var(--black30a)';
        masterSummary.style.borderRadius = '5px';
        masterSummary.style.marginBottom = '5px';
        masterSummary.style.userSelect = 'none';

        customContainer = document.createElement('div');
        customContainer.id = 'custom-world-folder-container';
        customContainer.className = 'world-info-folder-container';

        customContainer.style.maxHeight = '350px';
        customContainer.style.overflowY = 'auto';
        customContainer.style.overflowX = 'hidden';
        customContainer.style.paddingLeft = '5px';

        masterDetails.appendChild(masterSummary);
        masterDetails.appendChild(customContainer);

        const flexWrapper = worldSelect.closest('.flex-container') || worldSelect.parentNode;
        if (flexWrapper && flexWrapper.parentNode) {
            flexWrapper.parentNode.insertBefore(masterDetails, flexWrapper.nextSibling);
        }

        worldSelect.style.display = 'none';
    }

    // BULK SELECTION: toolbar toggle
    const bulkBtn = /** @type {HTMLElement | null} */ (masterDetails.querySelector('.bulk-select-btn'));
    if (bulkBtn && !bulkBtn.hasAttribute('data-bulk-wired')) {
        bulkBtn.setAttribute('data-bulk-wired', 'true');

        bulkBtn.addEventListener('click', (/** @type {MouseEvent} */ e) => {
            e.preventDefault();
            e.stopPropagation();
            isSelectionMode = !isSelectionMode;
            if (!isSelectionMode) selectedBooks.clear();
            renderFolders();
        });
    }

    if (bulkBtn) {
        bulkBtn.style.opacity = isSelectionMode ? '1' : '0.7';
        bulkBtn.style.color = isSelectionMode ? 'var(--SmartThemeQuoteColor, #4caf50)' : '';
    }

    customContainer.innerHTML = '';

    const availableBooks = Array.from(worldSelect.options)
        .filter(opt => opt.value !== '')
        .map(opt => ({ value: opt.value, text: opt.text }));

    // --- AUTO-RENAME DETECTION ALGORITHM ---
    if (lastAvailableBooks.length > 0 && lastAvailableBooks.length === availableBooks.length) {
        const missingBooks = lastAvailableBooks.filter(oldBook => !availableBooks.find(b => b.text === oldBook.text));
        const newBooks = availableBooks.filter(newBook => !lastAvailableBooks.find(b => b.text === newBook.text));

        if (missingBooks.length === 1 && newBooks.length === 1) {
            const oldName = missingBooks[0].text;
            const newName = newBooks[0].text;
            const oldVal = missingBooks[0].value;
            const newVal = newBooks[0].value;

            // Preserves Custom Folder Mapping
            for (const folderName in settings.folders) {
                const index = settings.folders[folderName].indexOf(oldName);
                if (index !== -1) {
                    settings.folders[folderName][index] = newName;
                    break;
                }
            }

            // Preserves Connection Profile Mapping
            for (const profile in settings.profileLorebooks) {
                const pIndex = settings.profileLorebooks[profile].indexOf(oldVal);
                if (pIndex !== -1) {
                    settings.profileLorebooks[profile][pIndex] = newVal;
                }
            }
            // Preserves Multi Chat Lore Mapping
            for (const cId in settings.chatLorebooks) {
                const cIndex = settings.chatLorebooks[cId].indexOf(oldName);
                if (cIndex !== -1) {
                    settings.chatLorebooks[cId][cIndex] = newName;
                }
            }
            saveSettingsDebounced();
        }
    }
    lastAvailableBooks = availableBooks;

    const assignedLorebooks = new Set();

    /**
     * @param {string} folderName
     * @param {Array<{value: string, text: string}>} books
     */
    const createFolder = (folderName, books) => {
        const details = document.createElement('details');
        details.className = 'world-info-folder';
        // Stable DOM id so child folders can locate their parent for nesting
        details.id = `world-folder-${folderName.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

        if (settings.folderState[folderName]) details.open = true;
        details.addEventListener('toggle', () => {
            settings.folderState[folderName] = details.open;
            saveSettingsDebounced();
        });

        const summary = document.createElement('summary');

        // Subfolders display only their base name - the full path lives in the data
        const displayName = folderName.includes('/') ? folderName.split('/').pop() : folderName;

        let deleteBtnHtml = folderName !== "Uncategorized"
            ? `<i class="fa-solid fa-trash" style="float: right; color: var(--red); opacity: 0.7;" title="Delete Folder"></i>`
            : '';

        summary.innerHTML = `<i class="fa-solid fa-folder"></i> <span class="folder-name">${displayName}</span> ${deleteBtnHtml}`;

        // BULK SELECTION: folder header select-all (covers the subtree)
        if (isSelectionMode) {
            const folderCheck = document.createElement('input');
            folderCheck.type = 'checkbox';
            folderCheck.style.marginRight = '8px';
            folderCheck.style.cursor = 'pointer';

            // All books in this folder AND its subfolders
            // (Uncategorized isn't a settings key - its books arrive via the books param)
            const subtreeBooks = folderName === 'Uncategorized'
                ? books.map(/** @param {{value: string, text: string}} b */ b => b.text)
                : Object.keys(settings.folders)
                    .filter(key => key === folderName || key.startsWith(folderName + '/'))
                    .flatMap(key => settings.folders[key] || []);

            if (subtreeBooks.length > 0) {
                folderCheck.checked = subtreeBooks.every(b => selectedBooks.has(b));
                // Dash state when some-but-not-all of the subtree is selected
                folderCheck.indeterminate = !folderCheck.checked && subtreeBooks.some(b => selectedBooks.has(b));
                folderCheck.title = 'Select all lorebooks in this folder and its subfolders. The folders themselves are never moved or deleted.';
                folderCheck.addEventListener('click', (/** @type {MouseEvent} */ e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const allSelected = subtreeBooks.every(b => selectedBooks.has(b));

                    if (allSelected) {
                        subtreeBooks.forEach(/** @param {string} b */ b => selectedBooks.delete(b));
                    } else {
                        subtreeBooks.forEach(/** @param {string} b */ b => selectedBooks.add(b));
                    }

                    renderFolders();
                });

                summary.insertBefore(folderCheck, summary.firstChild);
            }
        }

        details.appendChild(summary);

        if (folderName !== "Uncategorized") {
            // === NESTED FOLDER DRAG AND DROP ===
            summary.draggable = true;

            // 1. Pick up the folder
            summary.addEventListener('dragstart', (/** @type {DragEvent} */ e) => {
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.setData('text/plain', folderName);
                    e.dataTransfer.effectAllowed = 'move';
                }
                summary.style.opacity = '0.5';
            });

            summary.addEventListener('dragend', () => {
                summary.style.opacity = '1';
            });

            // 2. Hovering over a target folder
            summary.addEventListener('dragover', (/** @type {DragEvent} */ e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                summary.style.backgroundColor = 'var(--SmartThemeQuoteColor, #4caf50)';
                summary.style.color = 'var(--black)';
            });

            summary.addEventListener('dragleave', (/** @type {DragEvent} */ e) => {
                e.stopPropagation();
                summary.style.backgroundColor = '';
                summary.style.color = '';
            });

            // 3. Dropping onto a target folder
            summary.addEventListener('drop', (/** @type {DragEvent} */ e) => {
                e.preventDefault();
                e.stopPropagation();
                summary.style.backgroundColor = '';
                summary.style.color = '';

                if (!e.dataTransfer) return;
                const draggedFolder = e.dataTransfer.getData('text/plain');

                // Prevents dropping a folder onto itself
                if (!draggedFolder || draggedFolder === folderName) return;

                // Prevents dropping a parent folder into its own descendant
                if (folderName.startsWith(draggedFolder + '/')) {
                    // @ts-ignore
                    toastr.warning("Cannot drop a parent folder into its own subfolder.");
                    return;
                }

                const draggedBaseName = draggedFolder.split('/').pop() || draggedFolder;
                const newFolderPath = `${folderName}/${draggedBaseName}`;

                if (settings.folders[newFolderPath]) {
                    // @ts-ignore
                    toastr.warning("A folder with that name already exists in this location!");
                    return;
                }

                // Moves the dragged folder to its new nested path
                settings.folders[newFolderPath] = settings.folders[draggedFolder];
                delete settings.folders[draggedFolder];

                if (settings.folderState[draggedFolder] !== undefined) {
                    settings.folderState[newFolderPath] = settings.folderState[draggedFolder];
                    delete settings.folderState[draggedFolder];
                }

                // Rewrites the paths of any subfolders inside the dragged folder
                const draggedPrefix = draggedFolder + '/';
                for (const oldKey in settings.folders) {
                    if (oldKey.startsWith(draggedPrefix)) {
                        const suffix = oldKey.substring(draggedPrefix.length);
                        const newChildPath = `${newFolderPath}/${suffix}`;

                        settings.folders[newChildPath] = settings.folders[oldKey];
                        delete settings.folders[oldKey];

                        if (settings.folderState[oldKey] !== undefined) {
                            settings.folderState[newChildPath] = settings.folderState[oldKey];
                            delete settings.folderState[oldKey];
                        }
                    }
                }

                saveSettingsDebounced();
                renderFolders();
            });

            const trashIcon = summary.querySelector('.fa-trash');
            if (trashIcon) {
                trashIcon.addEventListener('click', async (e) => {
                    e.preventDefault();

                    const { Popup } = SillyTavern.getContext();

                    let confirmed = false;
                    const message = `Delete folder <b>${displayName}</b> and any subfolders? (Their lorebooks will be moved back to Uncategorized)`;

                    if (Popup) {
                        // @ts-ignore
                        confirmed = await Popup.show.confirm('Delete Folder', message, { okButton: 'Delete', cancelButton: 'Cancel' });
                    } else {
                        confirmed = confirm(message.replace(/<[^>]+>/g, ''));
                    }

                    if (!confirmed) return;

                    // Deletes this folder AND cascades to its subfolders
                    delete settings.folders[folderName];
                    for (const key in settings.folders) {
                        if (key.startsWith(folderName + '/')) {
                            delete settings.folders[key];
                            delete settings.folderState[key];
                        }
                    }
                    saveSettingsDebounced();
                    renderFolders();
                });
            }
        }

        const list = document.createElement('div');
        list.className = 'folder-contents';
        list.style.marginTop = '5px';

        if (books.length === 0) {
            const emptyText = document.createElement('div');
            emptyText.style.opacity = '0.5';
            emptyText.style.paddingLeft = '15px';
            emptyText.style.fontStyle = 'italic';
            emptyText.innerText = 'Empty folder...';
            list.appendChild(emptyText);
        }

        books.forEach(/** @param {{value: string, text: string}} bookObj */ bookObj => {
            assignedLorebooks.add(bookObj.text);
            const item = document.createElement('div');
            item.className = 'folder-item';
            item.setAttribute('data-book-val', bookObj.value);

            item.style.paddingLeft = '15px';
            item.style.paddingTop = '4px';
            item.style.paddingBottom = '4px';
            item.style.cursor = 'pointer';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            // @ts-ignore
            const globalSelect = $('#world_info');
            const rawVal = globalSelect.val();
            /** @type {string[]} */
            const activeWorlds = Array.isArray(rawVal) ? rawVal : (rawVal ? [String(rawVal)] : []);

            const isActive = activeWorlds.includes(bookObj.value);
            const globeColor = isActive ? 'var(--SmartThemeQuoteColor, #4caf50)' : 'inherit';
            const globeOpacity = isActive ? '1' : '0.4';

            item.innerHTML = `
                <div class="book-name-click" style="flex-grow: 1;" title="Click to Load">
                    <i class="fa-solid fa-book"></i> ${bookObj.text}
                </div>
                <div class="global-toggle-btn" title="${isActive ? 'Deactivate Global Lorebook' : 'Activate Global Lorebook'}" style="opacity: ${globeOpacity}; color: ${globeColor}; padding: 0 5px;">
                    <i class="fa-solid fa-globe"></i>
                </div>
                <div class="move-btn" title="Move to Folder" style="opacity: 0.7; padding: 0 5px;">
                    <i class="fa-solid fa-arrow-right-to-bracket"></i>
                </div>
            `;

            if (isSelectionMode) {
                const checkLabel = document.createElement('label');
                checkLabel.style.cssText = 'display:flex;align-items:center;margin-right:6px;cursor:pointer;';

                const checkInput = document.createElement('input');
                checkInput.type = 'checkbox';
                checkInput.checked = selectedBooks.has(bookObj.text);
                checkInput.addEventListener('change', () => {
                    if (checkInput.checked) selectedBooks.add(bookObj.text);
                    else selectedBooks.delete(bookObj.text);
                    updateBulkBar();
                });

                checkLabel.appendChild(checkInput);
                item.insertBefore(checkLabel, item.firstChild);
            }

            const nameClick = item.querySelector('.book-name-click');
            if (nameClick) {
                nameClick.addEventListener('click', () => {
                    worldSelect.value = bookObj.value;
                    worldSelect.dispatchEvent(new Event('change'));
                });
            }

            const globalBtn = item.querySelector('.global-toggle-btn');
            if (globalBtn) {
                globalBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rawActive = globalSelect.val();
                    /** @type {string[]} */
                    let currentActive = Array.isArray(rawActive) ? rawActive : (rawActive ? [String(rawActive)] : []);

                    if (currentActive.includes(bookObj.value)) {
                        currentActive = currentActive.filter(/** @param {string} v */ v => v !== bookObj.value);
                    } else {
                        currentActive.push(bookObj.value);
                    }

                    // @ts-ignore
                    globalSelect.val(currentActive).trigger('change');
                    renderFolders();
                });
            }

            const moveBtn = /** @type {HTMLElement} */ (item.querySelector('.move-btn'));
            if (!moveBtn) return;

            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.querySelector('.folder-dropdown')) return;

                const folderNames = Object.keys(settings.folders).sort((a, b) =>
                    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
                );
                const select = document.createElement('select');

                select.className = 'folder-dropdown text_pole';
                select.style.width = '130px';
                select.style.padding = '2px';
                select.style.marginLeft = 'auto';

                // Explicit cancel entry at the top of the list
                const cancelOpt = document.createElement('option');
                cancelOpt.value = '';
                cancelOpt.innerText = '✕ Cancel';
                cancelOpt.style.opacity = '0.6';
                select.appendChild(cancelOpt);

                // Lists every folder INCLUDING the current one, pre-selected
                // mirroring the toolbar "Move this lorebook into a folder" button
                const allOptions = ['Uncategorized', ...folderNames];
                allOptions.forEach(/** @param {string} opt */ opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.innerText = opt;
                    if (opt === folderName) option.selected = true;
                    select.appendChild(option);
                });

                moveBtn.style.display = 'none';
                item.appendChild(select);

                select.addEventListener('change', () => {
                    const targetFolder = select.value;

                    if (!targetFolder) {
                        // "✕ Cancel" chosen - bail out without moving anything
                        select.remove();
                        moveBtn.style.display = 'block';
                        return;
                    }

                    for (const f in settings.folders) {
                        settings.folders[f] = settings.folders[f].filter(/** @param {string} b */ b => b !== bookObj.text);
                    }
                    if (targetFolder !== 'Uncategorized') {
                        settings.folders[targetFolder].push(bookObj.text);
                    }
                    saveSettingsDebounced();
                    renderFolders();
                });

                select.addEventListener('blur', () => {
                    select.remove();
                    moveBtn.style.display = 'block';
                });

                select.focus();
            });

            list.appendChild(item);
        });

        details.appendChild(list);
        return details;
    };

    // Sorts folder names alphabetically (case-insensitive & numeric-aware)
    const sortedFolderNames = Object.keys(settings.folders).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
    );

    for (const folderName of sortedFolderNames) {
        const bookNames = settings.folders[folderName];

        // @ts-ignore
        const booksInThisFolder = bookNames
            .map(/** @param {string} name */ name => availableBooks.find(b => b.text === name))
            .filter(/** @param {any} b */ b => b !== undefined);

        // Sorts the lorebooks inside this folder alphabetically
        booksInThisFolder.sort((/** @type {{value: string, text: string}} */ a, /** @type {{value: string, text: string}} */ b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base', numeric: true }));

        const folderElement = createFolder(folderName, booksInThisFolder);

        // Subfolders (paths containing '/') nest inside their parent folder
        if (folderName.includes('/')) {
            const parentPath = folderName.split('/').slice(0, -1).join('/');
            const parentElement = customContainer.querySelector(`#world-folder-${parentPath.replace(/[^a-zA-Z0-9-_]/g, '_')}`);

            if (parentElement) {
                // Direct children only, so we never grab a deeper subfolder's contents
                const parentContents = Array.from(parentElement.children).find(child => child.classList.contains('folder-contents'));

                if (parentContents) {
                    // Inserting before the first lorebook stacks all subfolders at the top,
                    // in alphabetical order (the sort above guarantees parents render first)
                    const firstBookItem = Array.from(parentContents.children).find(child => child.classList.contains('folder-item'));

                    if (firstBookItem) {
                        parentContents.insertBefore(folderElement, firstBookItem);
                    } else {
                        parentContents.appendChild(folderElement);
                    }
                    continue;
                }
            }
            // Parent missing - falls back to rendering at root level
        }

        // @ts-ignore
        customContainer.appendChild(folderElement);
    }

    const uncategorizedBooks = availableBooks.filter(b => !assignedLorebooks.has(b.text));

    // Sorts the Uncategorized lorebooks alphabetically
    uncategorizedBooks.sort((/** @type {{value: string, text: string}} */ a, /** @type {{value: string, text: string}} */ b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base', numeric: true }));

    customContainer.appendChild(createFolder("Uncategorized", uncategorizedBooks));

    // BULK SELECTION: action bar (footer of the drawer, never an overlay)
    const oldBar = document.getElementById('wip-bulk-bar');
    if (oldBar) oldBar.remove();

    if (isSelectionMode) {
        const bar = document.createElement('div');
        bar.id = 'wip-bulk-bar';
        // No sticky, no z-index - sits BELOW the scroll box like a footer
        bar.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 8px;margin-top:6px;background:var(--black30a, rgba(0,0,0,0.3));border:1px solid var(--SmartThemeBorderColor, #555);border-radius:5px;';

        const count = document.createElement('span');
        count.className = 'wip-bulk-count';
        count.style.marginRight = '4px';
        count.style.whiteSpace = 'nowrap';
        bar.appendChild(count);

        const allBtn = document.createElement('button');
        allBtn.className = 'menu_button';
        allBtn.style.whiteSpace = 'nowrap';

        // Label reflects what the click will actually do (bar is rebuilt every render)
        const allSelected = availableBooks.length > 0
            && availableBooks.every(/** @param {{value: string, text: string}} b */ b => selectedBooks.has(b.text));
        allBtn.textContent = allSelected ? 'Deselect All' : 'Select All';

        allBtn.addEventListener('click', () => {
            const isAllSelected = availableBooks.length > 0
                && availableBooks.every(/** @param {{value: string, text: string}} b */ b => selectedBooks.has(b.text));

            if (isAllSelected) {
                selectedBooks.clear();
            } else {
                availableBooks.forEach(/** @param {{value: string, text: string}} b */ b => selectedBooks.add(b.text));
            }
            renderFolders();
        });
        bar.appendChild(allBtn);

        const moveSelect = document.createElement('select');
        moveSelect.className = 'text_pole';
        moveSelect.setAttribute('data-bulk-action', 'true');
        moveSelect.style.color = 'var(--SmartThemeBodyColor, #ccc)';
        moveSelect.style.backgroundColor = 'var(--SmartThemeBlurTintColor, rgba(255,255,255,0.1))';
        moveSelect.style.maxWidth = '140px';

        const movePlaceholder = document.createElement('option');
        movePlaceholder.value = '';
        movePlaceholder.className = 'wip-bulk-move-placeholder';
        movePlaceholder.selected = true;
        movePlaceholder.innerText = `Move ${selectedBooks.size} to...`;
        moveSelect.appendChild(movePlaceholder);

        ['Uncategorized', ...Object.keys(settings.folders).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
        )].forEach(/** @param {string} opt */ opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt;
            moveSelect.appendChild(option);
        });

        moveSelect.addEventListener('change', () => {
            const target = moveSelect.value;
            if (!target) return;

            selectedBooks.forEach(/** @param {string} bookName */ bookName => {
                for (const f in settings.folders) {
                    settings.folders[f] = settings.folders[f].filter(/** @param {string} b */ b => b !== bookName);
                }
                if (target !== 'Uncategorized') {
                    if (!settings.folders[target]) settings.folders[target] = [];
                    settings.folders[target].push(bookName);
                }
            });

            selectedBooks.clear();
            saveSettingsDebounced();
            renderFolders();
        });
        bar.appendChild(moveSelect);

        const exportBtn = document.createElement('button');
        exportBtn.className = 'menu_button';
        exportBtn.setAttribute('data-bulk-action', 'true');
        exportBtn.style.whiteSpace = 'nowrap';
        exportBtn.innerHTML = '<i class="fa-solid fa-file-export"></i> Export';
        exportBtn.addEventListener('click', async () => {
            for (const name of selectedBooks) {
                try {
                    const data = await getLorebookData(name);
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${name}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                } catch (err) {
                    console.error(`[WIP] Failed to export lorebook '${name}':`, err);
                }
                await new Promise(r => setTimeout(r, 150));
            }
        });
        bar.appendChild(exportBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'menu_button';
        deleteBtn.setAttribute('data-bulk-action', 'true');
        deleteBtn.style.whiteSpace = 'nowrap';
        deleteBtn.style.color = 'var(--red)';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
        deleteBtn.addEventListener('click', async () => {
            const names = [...selectedBooks];
            const context = SillyTavern.getContext();

            let confirmed = false;
            const { Popup } = context;

            if (Popup) {
                // @ts-ignore
                confirmed = await Popup.show.confirm('Bulk Delete', `Permanently delete <b>${names.length}</b> lorebook(s)? This cannot be undone!`, { okButton: 'Delete', cancelButton: 'Cancel' });
            } else {
                confirmed = confirm(`Permanently delete ${names.length} lorebook(s)? This cannot be undone!`);
            }

            if (!confirmed) return;

            let deleted = 0;

            for (const name of names) {
                const globalSelectEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('world_info'));
                if (globalSelectEl) {
                    const deadOpt = Array.from(globalSelectEl.options).find(/** @param {HTMLOptionElement} o */ o => String(o.text || '').trim() === name);
                    if (deadOpt && String(deadOpt.value) !== '') {
                        const deadVal = String(deadOpt.value);
                        // @ts-ignore
                        const globalSelect = $('#world_info');
                        const rawVal = globalSelect.val();
                        const arr = Array.isArray(rawVal) ? rawVal.map(String) : (rawVal ? [String(rawVal)] : []);
                        // @ts-ignore
                        globalSelect.val(arr.filter(/** @param {string} v */ v => v !== deadVal)).trigger('change');
                    }
                }

                // Purge every extension reference: folders, chat lore, profile lore
                for (const f in settings.folders) {
                    settings.folders[f] = settings.folders[f].filter(/** @param {string} b */ b => b !== name);
                }
                if (settings.chatLorebooks) {
                    Object.keys(settings.chatLorebooks).forEach(id => {
                        settings.chatLorebooks[id] = settings.chatLorebooks[id].filter(/** @param {string} b */ b => b !== name);
                    });
                }
                if (settings.profileLorebooks) {
                    Object.keys(settings.profileLorebooks).forEach(p => {
                        settings.profileLorebooks[p] = settings.profileLorebooks[p].filter(/** @param {string} b */ b => b !== name);
                    });
                }

                try {
                    const res = await fetch('/api/worldinfo/delete', {
                        method: 'POST',
                        headers: context.getRequestHeaders(),
                        body: JSON.stringify({ name }),
                    });
                    if (res.ok) deleted++;
                } catch (err) {
                    console.error(`[WIP] Failed to delete lorebook '${name}':`, err);
                }
            }

            selectedBooks.clear();
            saveSettingsDebounced();

            if (typeof context.updateWorldInfoList === 'function') {
                await context.updateWorldInfoList();
            }
            // @ts-ignore
            $('#world_editor_select').trigger('change');

            renderFolders();

            // @ts-ignore
            toastr.success(`Deleted ${deleted} lorebook(s).`, 'Bulk Delete');
        });
        bar.appendChild(deleteBtn);

        const doneBtn = document.createElement('button');
        doneBtn.className = 'menu_button';
        doneBtn.style.whiteSpace = 'nowrap';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', () => {
            isSelectionMode = false;
            selectedBooks.clear();
            renderFolders();
        });
        bar.appendChild(doneBtn);

        masterDetails.appendChild(bar);
        updateBulkBar();
    }

    syncFolderHighlighting();
}