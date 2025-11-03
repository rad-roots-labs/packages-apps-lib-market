import { create_indexed_events_store, type IndexedEventsStorePayload } from '$root';
import type { RadrootsProfile } from "@radroots/events-bindings";
import { KIND_RADROOTS_PROFILE, type RadrootsProfileNostrEvent } from '@radroots/utils-nostr';

export function create_radroots_profile_manager(initial_indexed?: RadrootsProfileNostrEvent) {
    const store = create_indexed_events_store<RadrootsProfile>({
        key_of: (p) => p.author,
    });

    const to_indexed_payload = (r: RadrootsProfileNostrEvent): IndexedEventsStorePayload<RadrootsProfile> => ({
        id: r.id,
        kind: KIND_RADROOTS_PROFILE,
        author: r.author,
        published_at: r.published_at ?? 0,
        data: r.profile,
        source: 'indexed',
    });

    if (initial_indexed?.author && initial_indexed.profile) {
        store.init([to_indexed_payload(initial_indexed)]);
    } else {
        store.init([]);
    }

    const on_parsed_event = (parsed: RadrootsProfileNostrEvent) => {
        store.add({
            id: parsed.id,
            kind: parsed.kind ?? KIND_RADROOTS_PROFILE,
            author: parsed.author,
            published_at: parsed.published_at,
            data: parsed.profile,
            source: 'nostr',
        });
    }

    const init_from_indexed = (row?: RadrootsProfileNostrEvent) => {
        if (row?.author && row.profile) {
            store.init([to_indexed_payload(row)]);
        } else {
            store.init([]);
        }
    }

    return {
        get list() { return store.list; },
        get map() { return store.map; },
        init_from_indexed,
        on_parsed_event,
        to_indexed_payload,
    };
}
