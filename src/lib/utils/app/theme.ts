import { browser } from "$app/environment";
import { idb } from "$root";
import { get_store, get_system_theme, theme_key, theme_mode, theme_reset, theme_set, theme_toggle } from "@radroots/apps-lib";

export const toggle_theme = async (): Promise<void> => {
    await theme_toggle(async (mode) => {
        await idb.save_global("theme_mode", mode);
    });
};

export const init_theme = async (): Promise<void> => {
    let mode = await idb.read_global("theme_mode");
    let key = await idb.read_global("theme_key");

    if (!mode) {
        mode = get_system_theme();
        await idb.save_global("theme_mode", mode);
    }

    if (!key) {
        key = `os`;
        await idb.save_global("theme_key", key);
    }

    const $mode = get_store(theme_mode);
    const $key = get_store(theme_key);

    if (mode === $mode && key === $key) return;

    theme_mode.set(mode);
    theme_key.set(key);
    theme_reset.set(true);
};

theme_reset.subscribe((reset) => {
    if (!reset || !browser) return;
    theme_set(get_store(theme_key), get_store(theme_mode));
    theme_reset.set(false);
})
