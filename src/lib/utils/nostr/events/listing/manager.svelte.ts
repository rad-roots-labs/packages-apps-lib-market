import { create_indexed_events_store, type IndexedEventsStorePayload } from '$root';
import type { RadrootsListing } from "@radroots/events-bindings";
import { KIND_RADROOTS_LISTING, type RadrootsListingNostrEvent } from '@radroots/utils-nostr';

export function create_radroots_listing_manager(initial_indexed: RadrootsListingNostrEvent[] = []) {
    const store = create_indexed_events_store<RadrootsListing>({
        key_of: (p) => p.data?.d_tag,
    });

    const to_indexed_payload = (r: RadrootsListingNostrEvent): IndexedEventsStorePayload<RadrootsListing> => ({
        id: r.id,
        kind: KIND_RADROOTS_LISTING,
        author: r.author,
        published_at: r.published_at ?? 0,
        data: r.listing,
        source: 'indexed',
    });

    store.init(
        (initial_indexed ?? [])
            .filter((r) => r?.listing?.d_tag)
            .map(to_indexed_payload),
    );

    const on_parsed_event = (parsed: RadrootsListingNostrEvent) => {
        store.add({
            id: parsed.id,
            kind: parsed.kind ?? KIND_RADROOTS_LISTING,
            author: parsed.author,
            published_at: parsed.published_at,
            data: parsed.listing,
            source: 'nostr',
        });
    }

    const init_from_indexed = (rows: RadrootsListingNostrEvent[]) => {
        store.init(
            (rows ?? [])
                .filter((r) => r?.listing?.d_tag)
                .map(to_indexed_payload),
        );
    }

    return {
        get list() { return store.list; },
        get map() { return store.map; },
        init_from_indexed,
        on_parsed_event,
        to_indexed_payload,
    };
}
