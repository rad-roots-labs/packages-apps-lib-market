<script lang="ts">
    import LayoutColumnEntry from "$lib/components/layouts/layout-column-entry.svelte";
    import LayoutColumnHeadingDisplaySimple from "$lib/components/layouts/layout-column-heading-display-simple.svelte";
    import LayoutColumnHeadingViewButtons from "$lib/components/layouts/layout-column-heading-view-buttons.svelte";
    import LayoutColumnHeading from "$lib/components/layouts/layout-column-heading.svelte";
    import LayoutColumn from "$lib/components/layouts/layout-column.svelte";
    import {
        create_radroots_listing_manager,
        create_radroots_profile_manager,
        create_trade_flow_service,
        head_title_suffix,
        type IndexedEventsStorePayload,
        type IProfileViewIndexed,
        type TradeFlowService,
    } from "$root";
    import {
        NDKKind,
        type NDKEvent,
        type NDKUserProfile,
    } from "@nostr-dev-kit/ndk";
    import { Glyph, ndk } from "@radroots/apps-lib";
    import type { RadrootsCoreQuantityPrice } from "@radroots/core-bindings";
    import type {
        RadrootsListing,
        RadrootsListingEventMetadata,
        RadrootsListingQuantity,
        RadrootsProfile,
        RadrootsProfileEventMetadata,
    } from "@radroots/events-bindings";
    import {
        on_ndk_event,
        type RadrootsListingNostrEvent,
        type RadrootsProfileNostrEvent,
    } from "@radroots/utils-nostr";
    import { onDestroy, onMount } from "svelte";

    let { basis }: { basis: IProfileViewIndexed } = $props();

    let trade: TradeFlowService | null = $state(null);

    const listings_mgr = create_radroots_listing_manager();
    const profiles_mgr = create_radroots_profile_manager();

    function to_indexed_listing_payload_from_metadata(
        m: RadrootsListingEventMetadata,
    ): IndexedEventsStorePayload<RadrootsListing> {
        return {
            id: m.id,
            kind: 30402,
            author: m.author,
            published_at: m.published_at ?? 0,
            data: m.listing,
            source: "indexed",
        };
    }

    function to_indexed_profile_payload_from_metadata(
        m: RadrootsProfileEventMetadata,
    ): IndexedEventsStorePayload<RadrootsProfile> {
        return {
            id: m.id,
            kind: 0,
            author: m.author,
            published_at: m.published_at ?? 0,
            data: m.profile,
            source: "indexed",
        };
    }

    function current_listings_meta(): RadrootsListingEventMetadata[] {
        return "listings" in basis.indexed.events
            ? basis.indexed.events.listings
            : [];
    }

    function current_profile_meta(): RadrootsProfileEventMetadata {
        return basis.indexed.events.profile;
    }

    let listings_buffer = $state<IndexedEventsStorePayload<RadrootsListing>[]>(
        current_listings_meta()
            .filter((r) => r.listing && r.listing.d_tag)
            .map(to_indexed_listing_payload_from_metadata),
    );

    let profile_buffer =
        $state<IndexedEventsStorePayload<RadrootsProfile> | null>(
            current_profile_meta()
                ? to_indexed_profile_payload_from_metadata(
                      current_profile_meta(),
                  )
                : null,
        );

    let have_live_listings = $state(false);
    let have_live_profiles = $state(false);

    const listings_view = $derived(
        have_live_listings ? listings_mgr.list : listings_buffer,
    );
    const profile_view = $derived(
        have_live_profiles ? profiles_mgr.list?.[0] : profile_buffer,
    );

    let last_pk = $state(basis.indexed.public_key);
    $effect(() => {
        if (basis.indexed.public_key !== last_pk) {
            const new_listings_meta = current_listings_meta();
            const new_profile_meta = current_profile_meta();

            listings_buffer = new_listings_meta
                .filter((r) => r.listing && r.listing.d_tag)
                .map(to_indexed_listing_payload_from_metadata);

            profile_buffer = new_profile_meta
                ? to_indexed_profile_payload_from_metadata(new_profile_meta)
                : null;

            have_live_listings = false;
            have_live_profiles = false;

            trade?.set_filter_authors([basis.indexed.public_key]);

            last_pk = basis.indexed.public_key;
        }
    });

    const sub = $ndk.subscribe(
        {
            kinds: [NDKKind.Metadata, NDKKind.Classified],
            authors: [basis.indexed.public_key],
        },
        undefined,
        {
            onEvent: (event: NDKEvent) => {
                const parsed = on_ndk_event(event);
                if (parsed && "listing" in parsed) {
                    listings_mgr.on_parsed_event(
                        parsed as RadrootsListingNostrEvent,
                    );
                    if (!have_live_listings) have_live_listings = true;
                } else if (parsed && "profile" in parsed) {
                    profiles_mgr.on_parsed_event(
                        parsed as RadrootsProfileNostrEvent,
                    );
                    if (!have_live_profiles) have_live_profiles = true;
                }
            },
        },
    );

    onMount(async () => {
        trade = create_trade_flow_service({
            ndk: $ndk,
            ndk_user_store: () => {
                const u = $ndk.activeUser;
                if (!u) throw new Error("No active NDK user/signer found.");
                return u;
            },
        });
        trade.set_filter_authors([basis.indexed.public_key]);
    });

    onDestroy(() => {
        sub?.stop();
        trade?.destroy();
    });

    let ndk_profile: NDKUserProfile | null = $state(null);
    const data_user = $derived(
        $ndk.getUser({ pubkey: basis.indexed.public_key }),
    );
    $effect(() => {
        data_user.fetchProfile().then((profile) => {
            if (profile) ndk_profile = profile;
        });
    });

    const head_title = $derived(
        `${
            basis.indexed.events.profile.profile.display_name ||
            basis.indexed.events.profile.profile.name
        } (@${basis.indexed.events.profile.profile.name}) ${head_title_suffix}`,
    );

    function fmtQty(q: RadrootsListingQuantity): string {
        const v = q && q.value ? q.value : undefined;
        const amt = v && v.amount ? v.amount : "";
        const unit = v && v.unit ? v.unit : "";
        const lab = v && v.label ? v.label : q && q.label ? q.label : "";
        const pieces = [amt, unit, lab].filter((s) => s && `${s}`.length > 0);
        return pieces.join(" ");
    }

    function fmtPrice(p: RadrootsCoreQuantityPrice): string {
        const a = p && p.amount ? p.amount : undefined;
        const q = p && p.quantity ? p.quantity : undefined;
        const price = a && a.amount ? a.amount : "";
        const cur = a && a.currency ? a.currency : "";
        const qamt = q && q.amount ? q.amount : "";
        const qun = q && q.unit ? q.unit : "";
        const left = [price, cur]
            .filter((s) => s && `${s}`.length > 0)
            .join(" ");
        const right = [qamt, qun]
            .filter((s) => s && `${s}`.length > 0)
            .join(" ");
        return right ? `${left} per ${right}` : left;
    }

    function commentsFor(listingId: string) {
        if (!("listings" in basis.indexed.events)) return [];
        if (!("listing_comments" in basis.indexed.events)) return [];
        const key = listingId.toLowerCase();
        const m = basis.indexed.events.listing_comments;
        return m && m[key] ? m[key] : [];
    }

    function toDate(ts?: number): string {
        if (!ts) return "";
        try {
            const d = new Date(ts * 1000);
            return d.toLocaleDateString();
        } catch {
            return "";
        }
    }
</script>

<svelte:head>
    <title>{head_title}</title>
    <meta name="description" content={``} />
    <meta property="og:title" content={head_title} />
    <meta property="og:description" content={``} />
</svelte:head>

<LayoutColumn>
    <LayoutColumnEntry basis={{ classes: `bg-white` }}>
        <LayoutColumnHeading>
            {#snippet heading()}
                <LayoutColumnHeadingDisplaySimple>
                    {#snippet row1()}
                        <p
                            class={`font-br font-[600] text-base text-black_panther`}
                        >
                            {basis.indexed.events.profile.profile.name}
                        </p>
                        <Glyph
                            basis={{
                                classes: `text-lime-500`,
                                size: `sm`,
                                key: `plant`,
                            }}
                        />
                    {/snippet}
                    {#snippet row2()}
                        <p
                            class={`font-br font-[400] text-sm text-black_panther`}
                        >
                            {basis.indexed.events.profile.profile
                                .display_name ||
                                basis.indexed.events.profile.profile.name}
                        </p>
                    {/snippet}
                    {#snippet row3()}
                        <p
                            class={`font-rsfd font-[600] text-sm text-black_panther`}
                        >
                            {`${30}M followers`}
                        </p>
                        <p
                            class={`font-rsfd font-[600] text-sm text-black_panther`}
                        >
                            {`${209} following`}
                        </p>
                    {/snippet}
                </LayoutColumnHeadingDisplaySimple>
            {/snippet}
            {#snippet subheading()}
                <p class={`font-sans font-[400] text-sm text-black_panther`}>
                    {basis.indexed.events.profile.profile.about}
                </p>
            {/snippet}
        </LayoutColumnHeading>
        <LayoutColumnHeadingViewButtons />
    </LayoutColumnEntry>

    {#if "listings" in basis.indexed.events}
        <LayoutColumnEntry basis={{ classes: `gap-4` }}>
            {#each basis.indexed.events.listings as ev (ev.id)}
                <div class={`relative flex w-full flex-col`}>
                    <div class={`flex w-full flex-col gap-2 p-4`}>
                        <div class={`flex w-full flex-row justify-between`}>
                            <p
                                class={`font-sans text-base font-[500] text-black_panther`}
                            >
                                {ev.listing.product.title}
                            </p>
                            <p
                                class={`font-sans text-xs font-[500] text-cloak_grey`}
                            >
                                {toDate(ev.published_at)}
                            </p>
                        </div>
                        <p
                            class={`font-sans text-sm font-[400] text-black_panther/80`}
                        >
                            {ev.listing.product.summary}
                        </p>
                        <div class={`flex w-full flex-wrap gap-2 pt-1`}>
                            <span
                                class={`rounded-sm bg-ly1 px-2 py-0.5 text-xs font-[600] text-black_panther/90`}
                            >
                                {ev.listing.product.category}
                            </span>
                            {#if ev.listing.product.process}
                                <span
                                    class={`rounded-sm bg-ly1 px-2 py-0.5 text-xs font-[600] text-black_panther/90`}
                                >
                                    {ev.listing.product.process}
                                </span>
                            {/if}
                            {#if ev.listing.product.year}
                                <span
                                    class={`rounded-sm bg-ly1 px-2 py-0.5 text-xs font-[600] text-black_panther/90`}
                                >
                                    {ev.listing.product.year}
                                </span>
                            {/if}
                            {#if ev.listing.product.lot}
                                <span
                                    class={`rounded-sm bg-ly1 px-2 py-0.5 text-xs font-[600] text-black_panther/90`}
                                >
                                    {ev.listing.product.lot}
                                </span>
                            {/if}
                        </div>
                        <div class={`flex w-full flex-row gap-4 pt-2`}>
                            <div class={`flex flex-col`}>
                                <p
                                    class={`font-sans text-xs font-[700] text-black_panther/70`}
                                >
                                    Quantities
                                </p>
                                <p
                                    class={`font-sans text-sm text-black_panther/90`}
                                >
                                    {ev.listing.quantities
                                        .map((q) => fmtQty(q))
                                        .filter((s) => s.length > 0)
                                        .join(", ")}
                                </p>
                            </div>
                            <div class={`flex flex-col`}>
                                <p
                                    class={`font-sans text-xs font-[700] text-black_panther/70`}
                                >
                                    Prices
                                </p>
                                <p
                                    class={`font-sans text-sm text-black_panther/90`}
                                >
                                    {ev.listing.prices
                                        .map((p) => fmtPrice(p))
                                        .filter((s) => s.length > 0)
                                        .join(" · ")}
                                </p>
                            </div>
                        </div>
                        <div class={`flex w-full flex-row gap-2 pt-2`}>
                            <p
                                class={`font-sans text-xs font-[700] text-black_panther/70`}
                            >
                                Location
                            </p>
                            <p
                                class={`font-sans text-sm text-black_panther/90`}
                            >
                                {#if ev.listing.location}
                                    {ev.listing.location.primary}
                                    {ev.listing.location.city
                                        ? `, ${ev.listing.location.city}`
                                        : ""}
                                    {ev.listing.location.region
                                        ? `, ${ev.listing.location.region}`
                                        : ""}
                                    {ev.listing.location.country
                                        ? `, ${ev.listing.location.country.toUpperCase()}`
                                        : ""}
                                {:else}
                                    {"Unlisted"}
                                {/if}
                            </p>
                        </div>
                    </div>

                    <div class={`flex w-full flex-col gap-2 p-4`}>
                        <p
                            class={`font-sans text-xs font-[700] uppercase tracking-wide text-black_panther/70`}
                        >
                            Comments
                        </p>
                        {#each commentsFor(ev.id) as c (c.id)}
                            <div
                                class={`flex w-full flex-col gap-1 rounded-sm bg-ly1/40 p-3`}
                            >
                                <p
                                    class={`font-sans text-xs font-[600] text-black_panther/70`}
                                >
                                    {toDate(c.published_at)}
                                </p>
                                <p
                                    class={`font-sans text-sm font-[400] text-black_panther`}
                                >
                                    {c.comment && c.comment.content
                                        ? c.comment.content
                                        : ""}
                                </p>
                            </div>
                        {:else}
                            <p class={`font-sans text-sm text-cloak_grey`}>
                                No comments yet
                            </p>
                        {/each}
                    </div>
                </div>
            {/each}
        </LayoutColumnEntry>
    {/if}
</LayoutColumn>
