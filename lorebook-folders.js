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

        if (settings.folderState[folderName]) details.open = true;
        details.addEventListener('toggle', () => {
            settings.folderState[folderName] = details.open;
            saveSettingsDebounced();
        });

        const summary = document.createElement('summary');

        let deleteBtnHtml = folderName !== "Uncategorized"
            ? `<i class="fa-solid fa-trash" style="float: right; color: var(--red); opacity: 0.7;" title="Delete Folder"></i>`
            : '';

        summary.innerHTML = `<i class="fa-solid fa-folder"></i> <span class="folder-name">${folderName}</span> ${deleteBtnHtml}`;
        details.appendChild(summary);

        if (folderName !== "Uncategorized") {
            const trashIcon = summary.querySelector('.fa-trash');
            if (trashIcon) {
                trashIcon.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (confirm(`Delete folder '${folderName}'? (Its lorebooks will be moved back to Uncategorized)`)) {
                        delete settings.folders[folderName];
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

                const defaultOpt = document.createElement('option');
                defaultOpt.innerText = "Move to...";
                defaultOpt.value = "";
                defaultOpt.disabled = true;
                defaultOpt.selected = true;
                select.appendChild(defaultOpt);

                const allOptions = ["Uncategorized", ...folderNames];
                allOptions.forEach(/** @param {string} opt */ opt => {
                    if (opt === folderName) return;
                    const option = document.createElement('option');
                    option.value = opt;
                    option.innerText = opt;
                    select.appendChild(option);
                });

                moveBtn.style.display = 'none';
                item.appendChild(select);

                select.addEventListener('change', () => {
                    const targetFolder = select.value;
                    if (targetFolder) {
                        for (const f in settings.folders) {
                            settings.folders[f] = settings.folders[f].filter(/** @param {string} b */ b => b !== bookObj.text);
                        }
                        if (targetFolder !== "Uncategorized") {
                            settings.folders[targetFolder].push(bookObj.text);
                        }
                        saveSettingsDebounced();
                        renderFolders();
                    }
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

        // @ts-ignore
        customContainer.appendChild(createFolder(folderName, booksInThisFolder));
    }

    const uncategorizedBooks = availableBooks.filter(b => !assignedLorebooks.has(b.text));

    // Sorts the Uncategorized lorebooks alphabetically
    uncategorizedBooks.sort((/** @type {{value: string, text: string}} */ a, /** @type {{value: string, text: string}} */ b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base', numeric: true }));

    customContainer.appendChild(createFolder("Uncategorized", uncategorizedBooks));

    syncFolderHighlighting();
}