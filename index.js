// index.js

import { hijackNativeChatLoreButton, syncChatLorebooks, renderChatLoreField, scheduleHideChatLoreFromGlobalUI, cleanupBlankGlobalWorldInfoSelection, 
forceApplyChatLoreButtonStateSoon, syncNativeChatLoreMetadata, normalizeWorldInfoValueList } from './chat-lore.js';

import { injectUIDTools, setupInlineUIDObserver } from './uid-editor.js';

import { debouncedRenderFolders, syncFolderHighlighting, renderFolders } from './lorebook-folders.js';

import { injectProfileLinkButton, updateProfileInfoDisplay } from './profile-lorebooks.js';


const { extensionSettings, saveSettingsDebounced, eventSource, event_types } = SillyTavern.getContext();
const MODULE_NAME = 'world-info-plus';

/** @type {any} */
const settingsMap = extensionSettings;

if (!settingsMap[MODULE_NAME]) {
    settingsMap[MODULE_NAME] = {
        folders: {},
        folderState: {},
        masterOpen: true,
        profileLorebooks: {}
    };
}

const settings = settingsMap[MODULE_NAME];

// Ensure the mapping object exists for users upgrading from older script versions
if (!settings.profileLorebooks) settings.profileLorebooks = {};
if (settings.showUIDs === undefined) settings.showUIDs = true;
if (!settings.chatLorebooks) settings.chatLorebooks = {};

// ==========================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================

eventSource.on(event_types.APP_READY, () => {
    renderFolders();

    const createFolderBtn = document.createElement("button");
    createFolderBtn.id = "create-world-folder-btn";
    createFolderBtn.className = "menu_button fa-solid fa-folder-plus";
    createFolderBtn.title = "Create new World Info Folder";

    createFolderBtn.addEventListener("click", () => {
        const newFolder = prompt("Enter name for new folder:");
        if (newFolder && !settings.folders[newFolder]) {
            settings.folders[newFolder] = [];
            saveSettingsDebounced();
            renderFolders();
        } else if (newFolder) {
            alert("Folder already exists!");
        }
    });

    const worldSelect = document.getElementById('world_editor_select');
    const targetHeader = document.getElementById('world_info_panel') || (worldSelect ? worldSelect.parentNode : null);

    const collapseFoldersBtn = document.createElement("button");
    collapseFoldersBtn.id = "collapse-world-folder-btn";
    collapseFoldersBtn.className = "menu_button fa-solid fa-compress";
    collapseFoldersBtn.title = "Collapse all World Info Folders";

    collapseFoldersBtn.addEventListener("click", () => {
        // Collapse all details elements and update memory
        document.querySelectorAll('.world-info-folder').forEach(folder => {
            /** @type {HTMLDetailsElement} */ (folder).open = false;
        });
        for (const folderName in settings.folderState) {
            settings.folderState[folderName] = false;
        }
        saveSettingsDebounced();
    });

    if (targetHeader && !document.getElementById('create-world-folder-btn')) {
        // Inject both buttons side-by-side
        targetHeader.prepend(collapseFoldersBtn);
        targetHeader.prepend(createFolderBtn);
    }

    // --- DROPDOWN MUTATION OBSERVER (Prevents Rename Desync) ---
    // Watches the native dropdown for changes so UI instantly redraws without needing F5
    const dropdownObserver = new MutationObserver(() => {
        debouncedRenderFolders();
    });

    if (worldSelect) {
        dropdownObserver.observe(worldSelect, { childList: true });
        // Ensures highlighting updates even if a user uses the native "Pick to Edit" menu
        $('#world_editor_select').on('change', syncFolderHighlighting);
    }

    injectUIDTools();
    injectProfileLinkButton();
    setupInlineUIDObserver();

    // Restricts the Connection Profile observer strictly to the API panel
    const profileSelect = document.getElementById('connection_profiles');
    const apiPanel = profileSelect ? (profileSelect.closest('.inline-drawer, .right_menu_block') || document.body) : document.body;
    profileObserver.observe(apiPanel, { childList: true, subtree: true, characterData: true });

    renderChatLoreField();
    cleanupBlankGlobalWorldInfoSelection();
    syncNativeChatLoreMetadata();
    hijackNativeChatLoreButton();
    forceApplyChatLoreButtonStateSoon();

    // Watches the Global Select2 dropdown and dynamically hides Chat Lorebooks from it
    const globalSelector = document.getElementById('WIMultiSelector');
    if (globalSelector) {
        const badgeObserver = new MutationObserver(() => scheduleHideChatLoreFromGlobalUI());
        badgeObserver.observe(globalSelector, { childList: true, subtree: true });
    }

});

// Automatically switches active Lorebooks when a Connection Profile is selected
document.addEventListener('change', (e) => {
    const target = /** @type {HTMLSelectElement} */ (e.target);

    if (target && target.id === 'connection_profiles') {
        const profileName = target.value;
        if (!profileName) return;

        const linkedBooks = (settings.profileLorebooks && settings.profileLorebooks[profileName]) || [];

        // 1. Gather a list of ALL lorebooks that are bound to ANY profile
        const allManagedBooks = new Set();
        for (const p in settings.profileLorebooks) {
            settings.profileLorebooks[p].forEach(/** @param {string} id */ id => allManagedBooks.add(id));
        }

        // @ts-ignore
        const globalSelect = $('#world_info');
        const rawVal = globalSelect.val();
        /** @type {string[]} */
        let currentActive = normalizeWorldInfoValueList(rawVal);

        // 2. Remove ONLY the books that are managed by profiles (clearing previous profile state)
        currentActive = currentActive.filter(/** @param {string} id */ id => !allManagedBooks.has(id));

        // 3. Add the books specifically mapped to THIS new profile
        linkedBooks.forEach(/** @param {string} id */ id => {
            if (!currentActive.includes(id)) currentActive.push(id);
        });

        // @ts-ignore - Update ST's backend dropdown
        currentActive = normalizeWorldInfoValueList(currentActive);
        globalSelect.val(currentActive).trigger('change');
        scheduleHideChatLoreFromGlobalUI();

        debouncedRenderFolders();
        updateProfileInfoDisplay();

        if (linkedBooks.length > 0) {
            // @ts-ignore
            toastr.info(`Loaded ${linkedBooks.length} lorebook(s) mapped to Connection Profile: "${profileName}"`, 'Lorebooks Synced');
        } else {
            // @ts-ignore
            toastr.info(`Cleared profile-managed lorebooks for Connection Profile: "${profileName}"`, 'Lorebooks Cleared');
        }
    }
});

// Watches the DOM to inject the Lorebook display into the Connection Profile summary box
/** @type {ReturnType<typeof setTimeout> | undefined} */
let profileInfoDebounce;
const profileObserver = new MutationObserver(() => {
    clearTimeout(profileInfoDebounce);
    profileInfoDebounce = setTimeout(updateProfileInfoDisplay, 50); // Debounce for performance
});

// Watches the Character Management menu to safely hijack the native button
const charMenuObserver = new MutationObserver(() => {
    hijackNativeChatLoreButton();
});

// The right menu panel natively holds the character management UI
const rightMenu = document.getElementById('rm_char_block') || document.getElementById('character_popup') || document.body;
charMenuObserver.observe(rightMenu, {
    childList: true,
    subtree: true,
});

// Intercepts SillyTavern's native event to automatically swap lorebooks when a chat is opened
eventSource.on(event_types.CHAT_CHANGED, syncChatLorebooks);

eventSource.on(event_types.WORLDINFO_UPDATED, () => renderFolders());
eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, () => renderFolders());