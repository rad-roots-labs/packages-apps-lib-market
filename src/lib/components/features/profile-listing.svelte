<script lang="ts">
    import type {
        IndexedEventsStorePayload,
        OrderBundle,
        TradeFlowService,
        TradeListingBundle,
    } from "$root";

    import type { RadrootsListing } from "@radroots/events-bindings";
    import {
        TradeListingStage,
        type TradeListingOrderRequestPayload,
    } from "@radroots/trade-bindings";

    let {
        basis,
    }: {
        basis: {
            trade: TradeFlowService | null;
            listing_event: IndexedEventsStorePayload<RadrootsListing>;
        };
    } = $props();

    function build_order_payload(): TradeListingOrderRequestPayload {
        const listing = basis.listing_event?.data;
        if (!listing) throw new Error(`!listing`);

        const quantity = listing.quantities[0];
        if (!quantity) throw new Error(`!q`);

        const price = listing.prices[0];
        if (!price) throw new Error(`!price`);

        const payload: TradeListingOrderRequestPayload = {
            price,
            quantity,
        };
        return payload;
    }

    // ---- Reactive bundle + latest order selection ----
    const bundle = $derived<TradeListingBundle | undefined>(
        basis.trade?.get_trade_listing_bundle(basis.listing_event.id) ||
            undefined,
    );

    function pick_latest_order(
        b?: TradeListingBundle,
    ): OrderBundle | undefined {
        if (!b) return undefined;
        let best: OrderBundle | undefined;
        for (const [, ob] of b.pending_orders) {
            if (!best || (ob.last_update_at ?? 0) > (best.last_update_at ?? 0))
                best = ob;
        }
        for (const [, ob] of b.orders) {
            if (!best || (ob.last_update_at ?? 0) > (best.last_update_at ?? 0))
                best = ob;
        }
        return best;
    }

    const latest_order = $derived<OrderBundle | undefined>(
        pick_latest_order(bundle),
    );
    const is_loading = $derived<boolean>(!!latest_order?.loading);

    // Access results/feedback by enum key, not string
    const last_order_result = $derived(
        latest_order?.results?.[TradeListingStage.Order]?.at(-1),
    );
    const last_feedback = $derived(
        latest_order?.feedback?.[TradeListingStage.Order]?.at(-1),
    );

    // ---- Actions ----
    async function handle_order_click() {
        if (!basis.trade) return;
        try {
            const payload = build_order_payload();
            const res = await basis.trade.order_request(
                basis.listing_event.id,
                payload,
            );

            if (!res.ok) {
                console.warn("order_request failed", res.error, res.request);
                return;
            }

            const { request, result, order_id } = res;
            console.log("order created:", {
                request_id: request.id,
                order_id,
                result_id: result.id,
            });
        } catch (err) {
            console.error("order_request threw", err);
        }
    }
</script>

<div class="flex flex-col gap-2">
    <button class="px-3 py-1 rounded bg-ly1" onclick={handle_order_click}>
        {is_loading ? "ordering..." : "order"}
    </button>

    {#if last_order_result}
        <pre class="text-xs break-all">{JSON.stringify(
                last_order_result,
                null,
                2,
            )}</pre>
    {/if}

    {#if last_feedback}
        <pre class="text-xs break-all opacity-80">{JSON.stringify(
                last_feedback,
                null,
                2,
            )}</pre>
    {/if}
</div>
