// profile-lorebooks.js

const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;
const settings = settingsMap[MODULE_NAME];

// ==========================================
// GLOBAL TOOLBAR (PROFILE LINK)
// ==========================================

export function injectProfileLinkButton() {
    if (document.getElementById('link-profile-btn')) return;

    const openAllBtn = document.getElementById('OpenAllWIEntries');
    if (!openAllBtn || !openAllBtn.parentNode) return;

    const linkProfileBtn = document.createElement('div');
    linkProfileBtn.id = 'link-profile-btn';
    linkProfileBtn.className = 'menu_button interactable fa-solid fa-link';
    linkProfileBtn.title = 'Link active global Lorebooks to your current Connection Profile';

    linkProfileBtn.addEventListener('click', () => {
        const profileSelect = /** @type {HTMLSelectElement} */ (document.getElementById('connection_profiles'));
        if (!profileSelect || !profileSelect.value) {
            return alert('No Connection Profile selected! Please open the API Connections menu and select a profile first.');
        }

        const profileName = profileSelect.value;

        // @ts-ignore
        const globalSelect = $('#world_info');
        const rawVal = globalSelect.val();
        /** @type {string[]} */
        const activeWorlds = Array.isArray(rawVal) ? rawVal : (rawVal ? [String(rawVal)] : []);

        settings.profileLorebooks[profileName] = activeWorlds;
        saveSettingsDebounced();

        if (typeof updateProfileInfoDisplay === 'function') updateProfileInfoDisplay();

        // @ts-ignore
        toastr.success(`Successfully linked ${activeWorlds.length} lorebook(s) to Connection Profile: "${profileName}"`, 'Profile Linked');
    });

    // Safely injects right after the Re-Index button (loaded from uid-editor.js)
    const reindexBtn = document.getElementById('reindex-uids-btn');
    if (reindexBtn && reindexBtn.parentNode) {
        reindexBtn.parentNode.insertBefore(linkProfileBtn, reindexBtn.nextSibling);
    } else {
        const applyOrderBtn = openAllBtn.parentNode.querySelector('.fa-sort-numeric-down, [title*="Order" i], [title*="sorting" i]');
        if (applyOrderBtn && applyOrderBtn.parentNode) {
            applyOrderBtn.parentNode.insertBefore(linkProfileBtn, applyOrderBtn.nextSibling);
        } else {
            openAllBtn.parentNode.appendChild(linkProfileBtn);
        }
    }
}

export function updateProfileInfoDisplay() {
    const profileSelect = /** @type {HTMLSelectElement} */ (document.getElementById('connection_profiles'));
    if (!profileSelect) return;

    const profileName = profileSelect.value;
    if (!profileName) return;

    /** @type {string[]} */
    const linkedBookIds = (settings.profileLorebooks && settings.profileLorebooks[profileName]) || [];

    const worldSelect = /** @type {HTMLSelectElement} */ (document.getElementById('world_editor_select'));
    const availableBooks = worldSelect ? Array.from(worldSelect.options) : [];

    const linkedBookNames = linkedBookIds.map(/** @param {string} id */ id => {
        const matchingOption = availableBooks.find(opt => opt.value === id);
        return matchingOption ? matchingOption.text : id;
    });

    const lorebookText = linkedBookNames.length > 0 ? linkedBookNames.join(', ') : 'None';

    // Walks through the local API panel rather than the entire chat log to save massive CPU cycles
    const searchContainer = profileSelect.closest('.inline-drawer, .right_menu_block') || document.body;
    const walk = document.createTreeWalker(searchContainer, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walk.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes('Prompt Post-Processing:')) {
            const parent = /** @type {HTMLElement} */ (node.parentNode);

            // Ignore if it's an option in a dropdown
            if (!parent || parent.tagName === 'OPTION' || parent.tagName === 'SELECT') continue;

            // Identifies the exact HTML list element for cloning
            const block = parent.tagName === 'LI' ? parent : (parent.closest('li') || parent.closest('div'));
            if (!block || !block.parentNode) continue;

            // Checks if lorebooks display is already injected
            let injectedBlock = /** @type {HTMLElement} */ (block.parentNode.querySelector('.custom-profile-lorebooks-display'));

            if (!injectedBlock) {
                // Creates an element with the exact same HTML tag as the native list item (e.g., 'LI')
                injectedBlock = document.createElement(block.tagName);

                // Copies ST's native classes so it automatically inherits the bullet point
                injectedBlock.className = 'custom-profile-lorebooks-display ' + block.className;

                // If the theme isn't using an LI, adds fallback styling just in case
                if (block.tagName !== 'LI') {
                    injectedBlock.style.fontSize = '0.9em';
                    injectedBlock.style.opacity = '0.9';
                    injectedBlock.style.marginTop = '2px';
                }

                // Injects directly below summary block
                block.parentNode.insertBefore(injectedBlock, block.nextSibling);
            }

            // Checks if ST formats the summary title with <b> or <strong> and copies it
            const hasBold = block.querySelector('b') || block.querySelector('strong');
            if (hasBold) {
                const boldTag = hasBold.tagName.toLowerCase();
                injectedBlock.innerHTML = `<${boldTag}>Lorebooks:</${boldTag}> ${lorebookText}`;
            } else {
                injectedBlock.innerHTML = `Lorebooks: ${lorebookText}`;
            }

            break;
        }
    }
}