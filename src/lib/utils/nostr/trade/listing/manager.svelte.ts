import NDK, { NDKEvent, NDKSubscription, NDKUser } from "@nostr-dev-kit/ndk";
import { KIND_JOB_FEEDBACK } from "@radroots/events-bindings";
import { MARKER_LISTING, TradeListingStage, type TradeListingAcceptRequest, type TradeListingConveyanceRequest, type TradeListingFulfillmentRequest, type TradeListingInvoiceRequest, type TradeListingOrderRequestPayload, type TradeListingPaymentProofRequest, type TradeListingReceiptRequest } from "@radroots/trade-bindings";
import { time_now_ms } from "@radroots/utils";
import {
    KIND_RADROOTS_LISTING,
    REQUEST_KINDS,
    RESULT_KINDS,
    TAG_E,
    get_event_tag,
    get_job_input_data_for_marker,
    get_trade_listing_stage_from_event_kind,
    ndk_event_trade_listing_accept_request,
    ndk_event_trade_listing_conveyance_request,
    ndk_event_trade_listing_fulfillment_request,
    ndk_event_trade_listing_invoice_request,
    ndk_event_trade_listing_order_request,
    ndk_event_trade_listing_payment_request,
    ndk_event_trade_listing_receipt_request,
} from "@radroots/utils-nostr";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type {
    AcceptOptions,
    ConveyanceOptions,
    CreateTradeFlowServiceOptions,
    FulfillmentOptions,
    InvoiceOptions,
    OrderBundle,
    OrderRequestErr,
    OrderRequestOk,
    OrderRequestResult,
    PaymentOptions,
    ReceiptOptions,
    StageActionErr,
    StageActionOk,
    StageActionResult,
    StagePostInput,
    StagePostOutput,
    TradeFlowService,
    TradeListingBundle,
} from "./types";

const MAX_ITEMS_PER_BUCKET = 50;

type Waiter = {
    since_ms: number;
    resolve: (e: NDKEvent) => void;
    reject: (err: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
};

function push_capped<T>(arr: T[], item: T, cap: number): void {
    arr.push(item);
    if (arr.length > cap) arr.splice(0, arr.length - cap);
}

export class TradeFlowServiceImpl implements TradeFlowService {
    private ndk: NDK;
    private ndk_user_store: () => NDKUser;

    private sub: NDKSubscription | null = null;

    private events_to_thread = new Map<string, { listing_id: string; order_id?: string }>();
    private orphans_by_ref = new Map<string, NDKEvent[]>();
    private loading_ids = new SvelteSet<string>();
    private waiters_by_request = new Map<string, Set<Waiter>>();

    private latest_update_event: NDKEvent | undefined = undefined;
    private load_complete = false;

    private authors: string[] | undefined;
    private kinds: number[];
    private default_timeout_ms: number;

    public listings = new SvelteMap<string, TradeListingBundle>();

    private restarting = false;

    constructor(opts: CreateTradeFlowServiceOptions) {
        this.ndk = opts.ndk;
        this.ndk_user_store = opts.ndk_user_store;

        this.authors = opts.authors;
        this.kinds = opts.kinds
            ? opts.kinds
            : [
                KIND_RADROOTS_LISTING,
                ...Object.values(REQUEST_KINDS),
                ...Object.values(RESULT_KINDS),
                KIND_JOB_FEEDBACK,
            ];
        this.default_timeout_ms =
            typeof opts.default_timeout_ms === "number" ? opts.default_timeout_ms : 7000;

        this.restart_subscription();
    }

    get_latest_update(): NDKEvent | undefined {
        return this.latest_update_event;
    }

    set_filter_authors(authors?: string[] | undefined): void {
        this.authors = authors;
        this.restart_subscription();
    }

    set_filter_kinds(kinds: number[]): void {
        this.kinds = kinds;
        this.restart_subscription();
    }

    get_trade_listing_bundle(listing_id: string): TradeListingBundle | undefined {
        return this.listings.get(listing_id);
    }

    get_order_bundle(listing_id: string, order_id: string): OrderBundle | undefined {
        const listing_bundle = this.listings.get(listing_id);
        return listing_bundle ? listing_bundle.orders.get(order_id) : undefined;
    }

    is_loading(event_id: string): boolean {
        return this.loading_ids.has(event_id);
    }

    on_event(ev: NDKEvent): void {
        queueMicrotask(() => {
            if (!this.restarting) this.ingest_event(ev);
        });
    }

    async order_request(
        listing_id: string,
        payload: TradeListingOrderRequestPayload,
        timeout_ms?: number
    ): Promise<OrderRequestResult> {
        try {
            const request = await this.publish_request(() => {
                const data = { event: { id: listing_id }, payload };
                return ndk_event_trade_listing_order_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                });
            });

            this.events_to_thread.set(request.id, { listing_id });
            const listing_bundle = this.ensure_listing(listing_id);
            const order_bundle = this.ensure_order(listing_bundle, "pending", request.id);
            this.attach_event_to_order(order_bundle, request);
            this.index_event(request, listing_id, undefined);

            try {
                const result = await this.await_response_for(request.id, timeout_ms);
                const order_id = result.id;
                const bundle = this.get_order_bundle(listing_id, order_id);
                const ok: OrderRequestOk = { ok: true, request, result, order_id, bundle };
                return ok;
            } catch {
                this.update_loading_by_request(request.id, false);
                const err: OrderRequestErr = { ok: false, error: "error.timeout", request };
                return err;
            }
        } catch {
            const err: OrderRequestErr = { ok: false, error: "error.failed_to_publish" };
            return err;
        }
    }

    async accept_request(opts: AcceptOptions): Promise<StageActionResult<TradeListingStage.Accept>> {
        const { listing_id, order_id, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(TradeListingStage.Accept, listing_id, order_id);
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Accept> = {
                ok: false,
                stage: TradeListingStage.Accept,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingAcceptRequest = {
                order_result_event_id: order_id,
                listing_event_id: listing_id,
            };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_accept_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Accept, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Accept> = {
                ok: false,
                stage: TradeListingStage.Accept,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    async conveyance_request(
        opts: ConveyanceOptions
    ): Promise<StageActionResult<TradeListingStage.Conveyance>> {
        const { listing_id, order_id, method, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(
            TradeListingStage.Conveyance,
            listing_id,
            order_id
        );
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Conveyance> = {
                ok: false,
                stage: TradeListingStage.Conveyance,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingConveyanceRequest = {
                accept_result_event_id: prereq_id,
                method,
            };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_conveyance_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Conveyance, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Conveyance> = {
                ok: false,
                stage: TradeListingStage.Conveyance,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    async invoice_request(
        opts: InvoiceOptions
    ): Promise<StageActionResult<TradeListingStage.Invoice>> {
        const { listing_id, order_id, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(TradeListingStage.Invoice, listing_id, order_id);
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Invoice> = {
                ok: false,
                stage: TradeListingStage.Invoice,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingInvoiceRequest = { accept_result_event_id: prereq_id };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_invoice_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Invoice, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Invoice> = {
                ok: false,
                stage: TradeListingStage.Invoice,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    async payment_request(
        opts: PaymentOptions
    ): Promise<StageActionResult<TradeListingStage.Payment>> {
        const { listing_id, order_id, proof, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(TradeListingStage.Payment, listing_id, order_id);
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Payment> = {
                ok: false,
                stage: TradeListingStage.Payment,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingPaymentProofRequest = {
                invoice_result_event_id: prereq_id,
                proof,
            };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_payment_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Payment, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Payment> = {
                ok: false,
                stage: TradeListingStage.Payment,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    async fulfillment_request(
        opts: FulfillmentOptions
    ): Promise<StageActionResult<TradeListingStage.Fulfillment>> {
        const { listing_id, order_id, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(
            TradeListingStage.Fulfillment,
            listing_id,
            order_id
        );
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Fulfillment> = {
                ok: false,
                stage: TradeListingStage.Fulfillment,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingFulfillmentRequest = { payment_result_event_id: prereq_id };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_fulfillment_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Fulfillment, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Fulfillment> = {
                ok: false,
                stage: TradeListingStage.Fulfillment,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    async receipt_request(
        opts: ReceiptOptions
    ): Promise<StageActionResult<TradeListingStage.Receipt>> {
        const { listing_id, order_id, note, timeout_ms } = opts;
        const prereq_id = this.resolve_input_event_id(TradeListingStage.Receipt, listing_id, order_id);
        if (!prereq_id) {
            const err: StageActionErr<TradeListingStage.Receipt> = {
                ok: false,
                stage: TradeListingStage.Receipt,
                error: "error.missing_prerequisite",
            };
            return err;
        }
        try {
            const data: TradeListingReceiptRequest = note
                ? { fulfillment_result_event_id: prereq_id, note }
                : { fulfillment_result_event_id: prereq_id };
            const request = await this.publish_request(() =>
                ndk_event_trade_listing_receipt_request({
                    ndk: this.ndk,
                    ndk_user: this.ndk_user_store(),
                    data,
                })
            );
            return this.await_stage_result(TradeListingStage.Receipt, {
                listing_id,
                order_id,
                request,
                timeout_ms,
            });
        } catch {
            const err: StageActionErr<TradeListingStage.Receipt> = {
                ok: false,
                stage: TradeListingStage.Receipt,
                error: "error.failed_to_publish",
            };
            return err;
        }
    }

    post(input: StagePostInput): Promise<StagePostOutput> {
        switch (input.stage) {
            case TradeListingStage.Accept:
                return this.accept_request(input.opts);
            case TradeListingStage.Conveyance:
                return this.conveyance_request(input.opts);
            case TradeListingStage.Invoice:
                return this.invoice_request(input.opts);
            case TradeListingStage.Payment:
                return this.payment_request(input.opts);
            case TradeListingStage.Fulfillment:
                return this.fulfillment_request(input.opts);
            case TradeListingStage.Receipt:
                return this.receipt_request(input.opts);
            case TradeListingStage.Cancel:
            case TradeListingStage.Refund:
                return Promise.resolve({
                    ok: false,
                    stage: input.stage,
                    error: "error.not_implemented",
                });
        }
    }

    destroy(): void {
        if (this.sub) {
            this.sub.stop();
            this.sub = null;
        }
        this.listings.clear();
        this.events_to_thread.clear();
        this.orphans_by_ref.clear();
        this.loading_ids.clear();
        this.latest_update_event = undefined;
        this.load_complete = false;

        for (const set of this.waiters_by_request.values()) {
            for (const w of set) {
                if (w.timer) clearTimeout(w.timer);
                w.reject(new Error("service destroyed"));
            }
        }
        this.waiters_by_request.clear();
    }

    private async await_stage_result<S extends TradeListingStage>(
        stage: S,
        params: {
            listing_id: string;
            order_id: string;
            request: NDKEvent;
            timeout_ms?: number;
        }
    ): Promise<StageActionResult<S>> {
        const { listing_id, order_id, request, timeout_ms } = params;
        try {
            const result = await this.await_response_for(request.id, timeout_ms);
            const bundle = this.get_order_bundle(listing_id, order_id);
            const ok: StageActionOk<S> = { ok: true, stage, request, result, order_id, bundle };
            return ok;
        } catch {
            this.update_loading_by_request(request.id, false);
            const err: StageActionErr<S> = { ok: false, stage, error: "error.timeout", request };
            return err;
        }
    }

    private async publish_request(make: () => Promise<NDKEvent | undefined>): Promise<NDKEvent> {
        const ev = await make();
        if (!ev) throw new Error("failed");
        queueMicrotask(() => this.ingest_event(ev));
        return ev;
    }

    private async await_response_for(request_id: string, timeout_ms?: number): Promise<NDKEvent> {
        this.loading_ids.add(request_id);
        const since_ms = time_now_ms();

        return new Promise<NDKEvent>((resolve, reject) => {
            const cleanup = (w: Waiter) => {
                const set = this.waiters_by_request.get(request_id);
                if (set) {
                    set.delete(w);
                    if (set.size === 0) this.waiters_by_request.delete(request_id);
                }
                this.loading_ids.delete(request_id);
                if (w.timer) clearTimeout(w.timer);
            };

            const waiter: Waiter = {
                since_ms,
                resolve: (e) => {
                    cleanup(waiter);
                    resolve(e);
                },
                reject: () => {
                    cleanup(waiter);
                    reject(new Error("timeout"));
                },
            };

            const existing = this.waiters_by_request.get(request_id);
            if (existing) existing.add(waiter);
            else this.waiters_by_request.set(request_id, new Set<Waiter>([waiter]));

            const ms = typeof timeout_ms === "number" ? timeout_ms : this.default_timeout_ms;
            waiter.timer = setTimeout(() => {
                this.update_loading_by_request(request_id, false);
                waiter.reject(new Error("timeout"));
            }, ms);
        });
    }

    private restart_subscription(): void {
        if (this.sub) {
            this.sub.stop();
            this.sub = null;
        }

        this.listings.clear();
        this.events_to_thread.clear();
        this.orphans_by_ref.clear();
        this.loading_ids.clear();
        this.latest_update_event = undefined;
        this.load_complete = false;

        const filter: { kinds: number[]; authors?: string[] } = {
            kinds: this.kinds,
            ...(Array.isArray(this.authors) ? { authors: this.authors } : {}),
        };

        const sub = this.ndk.subscribe(filter, { closeOnEose: false });

        sub.on("event", (ev: NDKEvent) => {
            queueMicrotask(() => {
                if (!this.restarting) this.ingest_event(ev);
            });
        });

        sub.on("eose", () => {
            this.load_complete = true;
        });

        sub.start();
        this.sub = sub;
        this.restarting = false;
    }

    private ensure_listing(listing_id: string): TradeListingBundle {
        let listing_bundle = this.listings.get(listing_id);
        if (!listing_bundle) {
            listing_bundle = { listing: undefined, orders: new SvelteMap(), pending_orders: new SvelteMap() };
            this.listings.set(listing_id, listing_bundle);
        }
        return listing_bundle;
    }

    private ensure_order(
        listing_bundle: TradeListingBundle,
        bucket: "pending" | "orders",
        key: string
    ): OrderBundle {
        const map = bucket === "orders" ? listing_bundle.orders : listing_bundle.pending_orders;
        let order_bundle = map.get(key);
        if (!order_bundle) {
            order_bundle = {
                order_id: bucket === "orders" ? key : undefined,
                listing_id: listing_bundle.listing ? listing_bundle.listing.id : "",
                requests: Object.create(null),
                results: Object.create(null),
                feedback: Object.create(null),
                started_at: time_now_ms(),
                last_update_at: time_now_ms(),
                loading: false,
            };
            map.set(key, order_bundle);
        }
        return order_bundle;
    }

    private attach_event_to_order(order_bundle: OrderBundle, ev: NDKEvent): void {
        const stage = get_trade_listing_stage_from_event_kind(ev.kind);
        if (!stage) return;

        const is_request_kind = Object.values(REQUEST_KINDS).includes(ev.kind);
        const is_result_kind = Object.values(RESULT_KINDS).includes(ev.kind);

        if (is_request_kind) {
            const arr = order_bundle.requests[stage] || (order_bundle.requests[stage] = []);
            push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
            if (ev.kind === REQUEST_KINDS.order) order_bundle.loading = true;
        } else if (is_result_kind) {
            const arr = order_bundle.results[stage] || (order_bundle.results[stage] = []);
            push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
            order_bundle.loading = false;
        } else if (ev.kind === KIND_JOB_FEEDBACK) {
            const arr = order_bundle.feedback[stage] || (order_bundle.feedback[stage] = []);
            push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
        }

        order_bundle.last_update_at = time_now_ms();
    }

    private index_event(ev: NDKEvent, listing_id: string, order_id: string | undefined): void {
        if (!ev.id) return;
        this.events_to_thread.set(ev.id, { listing_id, order_id });
    }

    private adopt_orphans(parent_id: string, listing_id: string, order_id?: string): void {
        const children = this.orphans_by_ref.get(parent_id);
        if (!children || children.length === 0) return;
        this.orphans_by_ref.delete(parent_id);
        for (const child of children) queueMicrotask(() => this.ingest_event(child));
    }

    private resolve_listing_id_from_ref(ref_id?: string): string | undefined {
        if (!ref_id) return undefined;
        const thread = this.events_to_thread.get(ref_id);
        return thread ? thread.listing_id : undefined;
    }

    private ingest_event(ev: NDKEvent): void {
        if (!ev.id) return;

        if (ev.kind === KIND_RADROOTS_LISTING) {
            const listing_id = ev.id;
            const listing_bundle = this.ensure_listing(listing_id);
            listing_bundle.listing = ev;

            for (const [, ob] of listing_bundle.orders) ob.listing_id = listing_id;
            for (const [, ob] of listing_bundle.pending_orders) ob.listing_id = listing_id;

            this.index_event(ev, listing_id, undefined);
            this.adopt_orphans(listing_id, listing_id, undefined);
            return;
        }

        const ref_req_id_raw = get_event_tag(ev.tags, TAG_E);
        const ref_req_id = ref_req_id_raw ? ref_req_id_raw : undefined;

        if (ev.kind === REQUEST_KINDS.order) {
            const listing_id =
                get_job_input_data_for_marker(ev.tags, MARKER_LISTING) ||
                this.resolve_listing_id_from_ref(ref_req_id) ||
                ev.id;

            const listing_bundle = this.ensure_listing(listing_id);
            const order_bundle = this.ensure_order(listing_bundle, "pending", ev.id);

            this.index_event(ev, listing_id, undefined);
            this.attach_event_to_order(order_bundle, ev);
            this.adopt_orphans(ev.id, listing_id, undefined);
            return;
        }

        if (ev.kind === RESULT_KINDS.order) {
            const request_id = ref_req_id;
            const listing_id = this.resolve_listing_id_from_ref(request_id || "");
            if (!listing_id) {
                const arr = this.orphans_by_ref.get(request_id || "") || [];
                push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
                this.orphans_by_ref.set(request_id || "", arr);
                return;
            }

            const listing_bundle = this.ensure_listing(listing_id);
            const order_id = ev.id;

            let order_bundle = request_id ? listing_bundle.pending_orders.get(request_id) : undefined;
            if (request_id && listing_bundle.pending_orders.has(request_id))
                listing_bundle.pending_orders.delete(request_id);
            if (!order_bundle) order_bundle = this.ensure_order(listing_bundle, "orders", order_id);

            if (order_bundle && !listing_bundle.orders.has(order_id)) {
                order_bundle.order_id = order_id;
                listing_bundle.orders.set(order_id, order_bundle);
            }

            this.attach_event_to_order(order_bundle, ev);
            this.index_event(ev, listing_id, order_id);
            this.adopt_orphans(order_id, listing_id, order_id);
            return;
        }

        const listing_id = this.resolve_listing_id_from_ref(ref_req_id || "");
        if (!listing_id) {
            const arr = this.orphans_by_ref.get(ref_req_id || "") || [];
            push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
            this.orphans_by_ref.set(ref_req_id || "", arr);
            return;
        }

        const listing_bundle = this.ensure_listing(listing_id);
        const ref_thread = ref_req_id ? this.events_to_thread.get(ref_req_id) : undefined;
        const order_id = ref_thread ? ref_thread.order_id : undefined;

        if (!order_id) {
            if (ref_req_id && listing_bundle.pending_orders.has(ref_req_id)) {
                const order_bundle = listing_bundle.pending_orders.get(ref_req_id);
                if (order_bundle) {
                    this.attach_event_to_order(order_bundle, ev);
                    this.index_event(ev, listing_id, undefined);
                    this.adopt_orphans(ev.id, listing_id, undefined);
                    return;
                }
            }
            const arr = this.orphans_by_ref.get(ref_req_id || "") || [];
            push_capped(arr, ev, MAX_ITEMS_PER_BUCKET);
            this.orphans_by_ref.set(ref_req_id || "", arr);
            return;
        }

        let order_bundle = listing_bundle.orders.get(order_id);
        if (!order_bundle) {
            order_bundle = this.ensure_order(listing_bundle, "orders", order_id);
            listing_bundle.orders.set(order_id, order_bundle);
        }

        this.attach_event_to_order(order_bundle, ev);
        this.index_event(ev, listing_id, order_id);
        this.adopt_orphans(ev.id, listing_id, order_id);

        const waiters = this.waiters_by_request.get(ref_req_id || "");
        if (waiters && waiters.size) {
            const created_ms = (ev.created_at || 0) * 1000;
            for (const w of Array.from(waiters)) {
                if (created_ms > w.since_ms) w.resolve(ev);
            }
        }

        const is_result_or_feedback =
            Object.values(RESULT_KINDS).includes(ev.kind) || ev.kind === KIND_JOB_FEEDBACK;

        if (this.load_complete && is_result_or_feedback) {
            this.latest_update_event = ev;
        }
    }

    private update_loading_by_request(request_id: string, loading: boolean): void {
        const thread = this.events_to_thread.get(request_id);
        if (!thread) return;

        const listing_bundle = this.listings.get(thread.listing_id);
        if (!listing_bundle) return;

        if (listing_bundle.pending_orders.has(request_id)) {
            const order_bundle = listing_bundle.pending_orders.get(request_id);
            if (order_bundle && order_bundle.loading !== loading) {
                listing_bundle.pending_orders.set(request_id, { ...order_bundle, loading });
            }
            return;
        }

        if (thread.order_id && listing_bundle.orders.has(thread.order_id)) {
            const order_bundle = listing_bundle.orders.get(thread.order_id);
            if (order_bundle && order_bundle.loading !== loading) {
                listing_bundle.orders.set(thread.order_id, { ...order_bundle, loading });
            }
        }
    }

    private resolve_input_event_id(
        stage: Exclude<TradeListingStage, TradeListingStage.Order>,
        listing_id: string,
        order_id: string
    ): string | undefined {
        const bundle = this.get_order_bundle(listing_id, order_id);
        if (!bundle) return undefined;

        const last_id = (arr?: NDKEvent[]) => {
            if (!arr || arr.length === 0) return undefined;
            return arr[arr.length - 1].id;
        };

        if (
            stage === TradeListingStage.Accept ||
            stage === TradeListingStage.Cancel ||
            stage === TradeListingStage.Refund
        ) {
            return order_id;
        }
        if (stage === TradeListingStage.Conveyance || stage === TradeListingStage.Invoice) {
            return last_id(bundle.results.Accept);
        }
        if (stage === TradeListingStage.Payment) {
            return last_id(bundle.results.Invoice);
        }
        if (stage === TradeListingStage.Fulfillment) {
            return last_id(bundle.results.Payment);
        }
        if (stage === TradeListingStage.Receipt) {
            return last_id(bundle.results.Fulfillment);
        }
        return undefined;
    }
}

export function create_trade_flow_service(
    opts: CreateTradeFlowServiceOptions
): TradeFlowService {
    return new TradeFlowServiceImpl(opts);
}
