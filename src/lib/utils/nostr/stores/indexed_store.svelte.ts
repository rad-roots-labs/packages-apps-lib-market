import type { NdkEventBasis } from '@radroots/utils-nostr';
import { SvelteMap } from 'svelte/reactivity';

export type IndexedEventsStoreSource = 'indexed' | 'nostr';

export type IndexedEventsStorePayload<T> = NdkEventBasis<number> & {
    data: T;
    source: IndexedEventsStoreSource;
}

export type CreateIndexedEventsStoreOptions<T> = {
    key_of: (p: IndexedEventsStorePayload<T>) => string | undefined;
    is_newer?: (a: IndexedEventsStorePayload<T>, b: IndexedEventsStorePayload<T>) => boolean;
}

export const default_is_newer = <T>(a: IndexedEventsStorePayload<T>, b: IndexedEventsStorePayload<T>) => {
    const at = a.published_at ?? 0;
    const bt = b.published_at ?? 0;
    if (at !== bt) return at > bt;
    if (a.source !== b.source) return a.source === 'nostr';
    return a.id > b.id;
};

export function create_indexed_events_store<T>(opts: CreateIndexedEventsStoreOptions<T>) {
    let map = $state(new SvelteMap<string, IndexedEventsStorePayload<T>>());

    const add = (p: IndexedEventsStorePayload<T>) => {
        const key = opts.key_of(p);
        if (!key) return;
        const existing = map.get(key);
        const newer = existing ? (opts.is_newer ?? default_is_newer)(p, existing) : true;
        if (newer) map.set(key, p);
    };

    const init = (items: IndexedEventsStorePayload<T>[]) => {
        const m = new SvelteMap<string, IndexedEventsStorePayload<T>>();
        for (const it of items) {
            const key = opts.key_of(it);
            if (!key) continue;
            const ex = m.get(key);
            if (!ex || (opts.is_newer ?? default_is_newer)(it, ex)) m.set(key, it);
        }
        map = m;
    };

    const list_raw = $derived(Array.from(map.values()));

    const list = $derived([...list_raw].sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0)));

    return {
        get map() { return map; },
        get list() { return list; },
        add,
        init,
    };
}
