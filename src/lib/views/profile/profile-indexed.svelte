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
    import type {
        RadrootsListing,
        RadrootsProfile,
    } from "@radroots/events-bindings";
    import {
        on_ndk_event,
        type RadrootsListingNostrEvent,
        type RadrootsProfileNostrEvent,
    } from "@radroots/utils-nostr";
    import { onDestroy, onMount } from "svelte";

    let { basis }: { basis: IProfileViewIndexed } = $props();

    let trade: TradeFlowService | null = $state(null);

    const listings_mgr = create_radroots_listing_manager(
        ("listings" in basis.indexed.events
            ? basis.indexed.events.listings
            : []) as RadrootsListingNostrEvent[],
    );

    const profiles_mgr = create_radroots_profile_manager(
        ("profile" in basis.indexed.events
            ? basis.indexed.events.profile
            : undefined) as RadrootsProfileNostrEvent | undefined,
    );

    const initial_indexed_listings: RadrootsListingNostrEvent[] = (
        "listings" in basis.indexed.events ? basis.indexed.events.listings : []
    ) as RadrootsListingNostrEvent[];

    const initial_indexed_profile_row: RadrootsProfileNostrEvent | undefined = (
        "profile" in basis.indexed.events
            ? basis.indexed.events.profile
            : undefined
    ) as RadrootsProfileNostrEvent | undefined;

    let listings_buffer = $state<IndexedEventsStorePayload<RadrootsListing>[]>(
        initial_indexed_listings
            .filter((r) => r?.listing?.d_tag)
            .map(listings_mgr.to_indexed_payload),
    );

    let profile_buffer =
        $state<IndexedEventsStorePayload<RadrootsProfile> | null>(
            initial_indexed_profile_row
                ? profiles_mgr.to_indexed_payload(initial_indexed_profile_row)
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
            const new_indexed_listings: RadrootsListingNostrEvent[] = (
                "listings" in basis.indexed.events
                    ? basis.indexed.events.listings
                    : []
            ) as RadrootsListingNostrEvent[];

            const new_indexed_profile_row:
                | RadrootsProfileNostrEvent
                | undefined = (
                "profile" in basis.indexed.events
                    ? basis.indexed.events.profile
                    : undefined
            ) as RadrootsProfileNostrEvent | undefined;

            listings_buffer = new_indexed_listings
                .filter((r) => r?.listing?.d_tag)
                .map(listings_mgr.to_indexed_payload);

            profile_buffer = new_indexed_profile_row
                ? profiles_mgr.to_indexed_payload(new_indexed_profile_row)
                : null;

            have_live_listings = false;
            have_live_profiles = false;

            listings_mgr.init_from_indexed(new_indexed_listings);
            profiles_mgr.init_from_indexed(new_indexed_profile_row);

            // drive the trade service to only follow the new author
            trade?.set_filter_authors([basis.indexed.public_key]);

            last_pk = basis.indexed.public_key;
        }
    });

    // Profile + Listings (non-trade) live updates
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
                    listings_mgr.on_parsed_event(parsed);
                    if (!have_live_listings) have_live_listings = true;
                } else if (parsed && "profile" in parsed) {
                    profiles_mgr.on_parsed_event(parsed);
                    if (!have_live_profiles) have_live_profiles = true;
                }
            },
        },
    );

    onMount(async () => {
        // Instantiate the TradeFlowService (it manages its own subscription internally)
        trade = create_trade_flow_service({
            ndk: $ndk,
            ndk_user_store: () => {
                // Use the active signer’s user. Fail fast if missing.
                const u = $ndk.activeUser;
                if (!u) throw new Error("No active NDK user/signer found.");
                return u;
            },
            // Optional: you can also pass authors/kinds here up front
            // authors: [basis.indexed.public_key],
            // kinds: [...defaults...],
        });

        // Narrow to this profile’s pubkey (seller) — you can change this at runtime
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
                <p class={`font-rsfd font-[600] text-sm text-black_panther`}>
                    {basis.indexed.events.profile.profile.about}
                </p>
            {/snippet}
        </LayoutColumnHeading>
        <LayoutColumnHeadingViewButtons />
    </LayoutColumnEntry>
    {#if "listings" in basis.indexed.events}
        <LayoutColumnEntry basis={{ classes: `gap-4` }}>
            {#each basis.indexed.events.listings as ev (ev.id)}
                <div
                    class={`relative flex flex-col w-full justify-center items-center`}
                >
                    <div
                        class={`flex flex-col h-[10rem] w-full justify-center items-center bg-white`}
                    >
                        <div
                            class={`flex flex-row w-full justify-center items-center`}
                        >
                            <p
                                class={`font-sans font-[400] text-sm text-black_panther`}
                            >
                                {ev.listing.product.title}
                            </p>
                        </div>
                    </div>
                </div>
            {/each}
        </LayoutColumnEntry>
    {/if}
</LayoutColumn>

<!--

<div class="flex flex-col w-full gap-4 p-4 justify-start items-start">
    <div class="flex flex-row pl-2 justify-start items-center">
        <a href={`/`}>
            <p class="font-sans font-[400] text-base text-ly0-gl">go back</p>
        </a>
    </div>

    <button
        class="flex flex-col w-full p-4 justify-start items-start bg-ly1"
        onclick={() => console.log(`profile_view?.id`, profile_view?.id)}
    >
        {#if profile_view}
            <p class="font-sans font-[400] text-base text-ly0-gl">profile:</p>
            <p class="font-sans font-[400] text-base text-ly0-gl break-all">
                {profile_view.data.nip05}
            </p>
        {:else}
            <p class="font-sans font-[400] text-base text-ly0-gl">no profile</p>
        {/if}
    </button>

    <div class="flex flex-col w-full gap-4 justify-start items-start">
        {#if listings_view.length}
            {#each listings_view as listing}
                <button
                    class="flex flex-col w-full p-4 justify-start items-start bg-ly1"
                    onclick={() => console.log(`listing.id`, listing.id)}
                >
                    <p class="font-sans font-[400] text-base text-ly0-gl">
                        listing:
                    </p>
                    <p
                        class="font-sans font-[400] text-base text-ly0-gl break-all"
                    >
                        {listing.kind}
                    </p>
                    <p
                        class="font-sans font-[400] text-base text-ly0-gl break-all"
                    >
                        {listing.data.d_tag}
                    </p>
                </button>

                <ProfileListing
                    basis={{
                        trade,
                        listing_event: listing,
                    }}
                />
            {/each}
        {:else}
            <p class="font-sans font-[400] text-base text-ly0-gl">
                no listings
            </p>
        {/if}
    </div>
</div>
-->
