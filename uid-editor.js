// uid-editor.js

const { extensionSettings, saveSettingsDebounced, getRequestHeaders } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;
const settings = settingsMap[MODULE_NAME];

// ==========================================
// 1. LOREBOOK API FETCH FUNCTIONS
// ==========================================

/**
 * Fetches the raw Lorebook JSON from the SillyTavern backend
 * @param {string} bookName
 */
export async function getLorebookData(bookName) {
    const res = await fetch('/api/worldinfo/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: bookName })
    });
    return await res.json();
}

/**
 * Saves the modified Lorebook JSON back to the server and automatically refreshes
 * @param {string} bookName
 * @param {object} bookData
 */
async function saveLorebookData(bookName, bookData) {
    await fetch('/api/worldinfo/edit', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: bookName, data: bookData })
    });

    // @ts-ignore
    toastr.success('Lorebook saved! Refreshing interface to apply UIDs...', 'Success');

    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// ==========================================
// 2. GLOBAL TOOLBAR (RE-INDEX & PROFILE LINK)
// ==========================================

export function injectUIDTools() {
    if (document.getElementById('reindex-uids-btn')) return;

    const openAllBtn = document.getElementById('OpenAllWIEntries');
    if (!openAllBtn || !openAllBtn.parentNode) return;

    // --- Re-Index UIDs Button ---
    const reindexBtn = document.createElement('div');
    reindexBtn.id = 'reindex-uids-btn';
    reindexBtn.className = 'menu_button interactable fa-solid fa-list-ol';
    reindexBtn.title = 'Re-index all UIDs based on visual order (Fixes Export sorting)';

    reindexBtn.addEventListener('click', async () => {
        const bookSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
        if (!bookSelect || !bookSelect.value) {
            // @ts-ignore
            return toastr.warning('No lorebook selected!');
        }

        const { Popup } = SillyTavern.getContext();

        let confirmed = false;
        const message = 'This will <b>permanently renumber all UIDs</b> from 0 to N based on their CURRENT VISUAL ORDER on your screen to fix export sorting. Proceed?';

        if (Popup) {
            // @ts-ignore
            confirmed = await Popup.show.confirm('Re-index UIDs', message, { okButton: 'Re-index', cancelButton: 'Cancel' });
        } else {
            confirmed = confirm(message.replace(/<[^>]+>/g, '')); // strips tags for the plain-text fallback
        }

        if (!confirmed) return;

        const bookName = bookSelect.options[bookSelect.selectedIndex].text;

        try {
            const bookData = await getLorebookData(bookName);

            /** @type {string[]} */
            const visualUidOrder = [];

            // @ts-ignore
            $('.world_entry').each((/** @type {number} */ _, /** @type {HTMLElement} */ entryDiv) => {
                // @ts-ignore
                let uid = $(entryDiv).attr('uid') || $(entryDiv).data('uid');

                if (uid === undefined) {
                    // @ts-ignore
                    uid = $(entryDiv).find('textarea[name="content"]').data('uid');
                }
                if (uid === undefined) {
                    // @ts-ignore
                    uid = $(entryDiv).find('[data-uid]').data('uid') || $(entryDiv).find('[uid]').attr('uid');
                }

                if (uid !== undefined) {
                    visualUidOrder.push(String(uid));
                }
            });

            if (visualUidOrder.length === 0) {
                // @ts-ignore
                return toastr.warning('Could not detect any entries on the screen! Make sure the lorebook is open and entries are visible.');
            }

            if (visualUidOrder.length !== Object.keys(bookData.entries).length) {
                // @ts-ignore
                return toastr.warning('Mismatch between visible entries and saved data. Please clear any search filters so all entries are visible, and try again.');
            }

            /** @type {Record<number, any>} */
            const newEntries = {};

            visualUidOrder.forEach((oldUid, newIndex) => {
                const entry = bookData.entries[oldUid];
                if (entry) {
                    entry.uid = newIndex;
                    newEntries[newIndex] = entry;
                }
            });

            bookData.entries = newEntries;

            await saveLorebookData(bookName, bookData);

        } catch (err) {
            console.error(err);
            // @ts-ignore
            toastr.error('Failed to re-index UIDs. Check console for details.');
        }
    });

    // Injects both buttons to the right of the native "Apply Order" button
    const applyOrderBtn = openAllBtn.parentNode.querySelector('.fa-sort-numeric-down, [title*="Order" i], [title*="sorting" i]');

    if (applyOrderBtn && applyOrderBtn.parentNode) {
        applyOrderBtn.parentNode.insertBefore(reindexBtn, applyOrderBtn.nextSibling);
    } else {
        openAllBtn.parentNode.appendChild(reindexBtn);
    }
}

// ==========================================
// 3. INLINE UID EDITOR
// ==========================================

export function setupInlineUIDObserver() {
    const observer = new MutationObserver(() => {
        document.querySelectorAll('[data-i18n="Title/Memo"]').forEach(titleMemoHeader => {
            if (titleMemoHeader.parentNode && !titleMemoHeader.parentNode.querySelector('.show-uid-global-toggle')) {

                // Makes the parent container relative to absolutely position the checkbox
                /** @type {HTMLElement} */ (titleMemoHeader.parentNode).style.position = 'relative';

                const cbContainer = document.createElement('label');
                cbContainer.className = 'checkbox_label show-uid-global-toggle';

                // Pulls it out of the flexbox flow to stop it from shifting the other headers
                cbContainer.style.position = 'absolute';
                cbContainer.style.left = '15px';
                cbContainer.style.top = '50%';
                cbContainer.style.transform = 'translateY(-50%)';

                cbContainer.style.display = 'inline-flex';
                cbContainer.style.alignItems = 'center';
                cbContainer.style.whiteSpace = 'nowrap';

                // Wraps the text in <small> so it perfectly matches the size of the other headers
                cbContainer.innerHTML = `
                    <input type="checkbox" class="show-uid-checkbox" ${settings.showUIDs ? 'checked' : ''} style="margin-right: 5px;">
                    <small>Show UID</small>
                `;

                cbContainer.addEventListener('change', (e) => {
                    const isChecked = /** @type {HTMLInputElement} */ (e.target).checked;
                    settings.showUIDs = isChecked;
                    saveSettingsDebounced();

                    // Toggles visibility for all UID buttons instantly across the screen
                    document.querySelectorAll('.inline-uid-edit-btn').forEach(btn => {
                        /** @type {HTMLElement} */ (btn).style.display = isChecked ? 'inline-flex' : 'none';
                    });

                    // Syncs all checkboxes if multiple views exist simultaneously
                    document.querySelectorAll('.show-uid-checkbox').forEach(cb => {
                        /** @type {HTMLInputElement} */ (cb).checked = isChecked;
                    });
                });

                titleMemoHeader.parentNode.insertBefore(cbContainer, titleMemoHeader);
            }
        });

        // Injects the inline UID buttons into the individual entries
        // @ts-ignore
        $('.world_entry').each((/** @type {number} */ _, /** @type {HTMLElement} */ entryDiv) => {
            if (!entryDiv.querySelector('.inline-uid-edit-btn')) {
                injectInlineButton(entryDiv);
            }
        });
    });

    const worldSelect = document.getElementById('world_editor_select');
    const worldInfoPanel = worldSelect ? (worldSelect.closest('.inline-drawer, .right_menu_block') || document.body) : document.body;
    observer.observe(worldInfoPanel, { childList: true, subtree: true });
}

/**
 * @param {HTMLElement} entryDiv
 */
function injectInlineButton(entryDiv) {
    // @ts-ignore
    let uid = $(entryDiv).attr('uid') || $(entryDiv).data('uid');
    if (uid === undefined) {
        // @ts-ignore
        uid = $(entryDiv).find('textarea[name="content"]').data('uid');
    }
    if (uid === undefined) {
        // @ts-ignore
        uid = $(entryDiv).find('[data-uid]').data('uid') || $(entryDiv).find('[uid]').attr('uid');
    }

    if (uid === undefined) return;

    // --- Injects the UID Button into the entry's header ---
    const editBtn = document.createElement('div');
    editBtn.className = 'inline-uid-edit-btn interactable';
    editBtn.title = `Change UID`;
    editBtn.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> UID: ${uid}`;

    // Respect the global toggle state when initially drawing the button
    editBtn.style.display = settings.showUIDs ? 'inline-flex' : 'none';
    editBtn.style.alignItems = 'center';
    editBtn.style.justifyContent = 'center';
    editBtn.style.gap = '5px';
    editBtn.style.padding = '2px 0px';
    editBtn.style.marginLeft = '5px';
    editBtn.style.marginRight = '5px';
    editBtn.style.fontSize = '0.85em';
    editBtn.style.backgroundColor = 'var(--black30a)';
    editBtn.style.border = '1px solid var(--SmartThemeBorderColor)';
    editBtn.style.borderRadius = '5px';
    editBtn.style.cursor = 'pointer';
    editBtn.style.opacity = '0.8';

    // Original, un-squished 75px design
    editBtn.style.width = '75px';
    editBtn.style.minWidth = '75px';
    editBtn.style.flexShrink = '0';

    editBtn.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
    editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.8');

    editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const bookSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
        if (!bookSelect || !bookSelect.value) {
            // @ts-ignore
            return toastr.warning('No lorebook selected!');
        }

        const bookName = bookSelect.options[bookSelect.selectedIndex].text;
        const oldUid = String(uid);

        const { Popup } = SillyTavern.getContext();

        /** @type {string | null} */
        let newUid = null;

        if (Popup) {
            // @ts-ignore
            newUid = await Popup.show.input(
                'Edit UID',
                `Enter the NEW UID to replace <b>${oldUid}</b>:`,
                '',
                { okButton: 'Save', cancelButton: 'Cancel' }
            );
        } else {
            newUid = prompt(`Enter the NEW UID to replace ${oldUid}:`);
        }

        if (newUid === null || newUid === '') return; // cancelled or left blank

        if (isNaN(Number(newUid))) {
            // @ts-ignore
            toastr.warning('Please enter a valid numeric UID.');
            return;
        }

        try {
            const bookData = await getLorebookData(bookName);

            if (!bookData.entries[oldUid]) {
                // @ts-ignore
                return toastr.error(`UID ${oldUid} not found in this lorebook.`);
            }
            if (bookData.entries[newUid]) {
                // @ts-ignore
                return toastr.warning(`UID ${newUid} already exists! Choose an unused number.`);
            }

            bookData.entries[newUid] = bookData.entries[oldUid];
            bookData.entries[newUid].uid = Number(newUid);
            delete bookData.entries[oldUid];

            await saveLorebookData(bookName, bookData);

        } catch (err) {
            console.error(err);
            // @ts-ignore
            toastr.error('Failed to update UID. Check console for details.');
        }
    });

    editBtn.addEventListener('mousedown', (e) => e.stopPropagation());

    const headerRow = entryDiv.querySelector('.inline-drawer-header') ||
                      entryDiv.querySelector('.world_entry_header') ||
                      entryDiv.querySelector('summary');

    if (headerRow) {
        // Inserts into the flex row after the drag handle
        if (headerRow.children.length > 1) {
            headerRow.insertBefore(editBtn, headerRow.children[1]);
        } else {
            headerRow.appendChild(editBtn);
        }
    } else {
        entryDiv.prepend(editBtn);
    }
}