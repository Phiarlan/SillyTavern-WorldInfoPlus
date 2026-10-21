// lorebook-folders.js

const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;
const settings = settingsMap[MODULE_NAME];

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
        masterSummary.innerHTML = `<b><i class="fa-solid fa-folder-tree"></i> Tag Folders</b>`;
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
                    alert("Cannot drop a parent folder into its own subfolder.");
                    return;
                }

                const draggedBaseName = draggedFolder.split('/').pop() || draggedFolder;
                const newFolderPath = `${folderName}/${draggedBaseName}`;

                if (settings.folders[newFolderPath]) {
                    alert("A folder with that name already exists in this location!");
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
                trashIcon.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (confirm(`Delete folder '${displayName}' and any subfolders? (Their lorebooks will be moved back to Uncategorized)`)) {
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
                    }
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

    syncFolderHighlighting();
}