import { NDKEvent, NDKUser } from "@nostr-dev-kit/ndk";
import type { ndk, StoreWritable } from "@radroots/apps-lib";
import type { TradeListingConveyanceRequest, TradeListingOrderRequestPayload, TradeListingPaymentProofRequest, TradeListingStage } from "@radroots/trade-bindings";
import type { SvelteMap } from "svelte/reactivity";

export type TradeListingStageKey = keyof typeof TradeListingStage;

export type TradeFlowServiceError =
    | "error.failed_to_publish"
    | "error.timeout"
    | "error.missing_payload"
    | "error.missing_order_id"
    | "error.missing_prerequisite"
    | "error.not_implemented"
    | "error.service_destroyed";

export interface OrderBundle {
    order_id?: string;
    listing_id: string;
    requests: Partial<Record<TradeListingStage, NDKEvent[]>>;
    results: Partial<Record<TradeListingStage, NDKEvent[]>>;
    feedback: Partial<Record<TradeListingStage, NDKEvent[]>>;
    started_at?: number;
    last_update_at?: number;
    loading: boolean;
}

export interface TradeListingBundle {
    listing?: NDKEvent;
    orders: SvelteMap<string, OrderBundle>;
    pending_orders: SvelteMap<string, OrderBundle>;
}

export type OrderRequestOk = {
    ok: true;
    request: NDKEvent;
    result: NDKEvent;
    order_id: string;
    bundle?: OrderBundle;
};

export type OrderRequestErr = {
    ok: false;
    error: TradeFlowServiceError;
    request?: NDKEvent;
};

export type OrderRequestResult = OrderRequestOk | OrderRequestErr;

export type StageActionOk<S extends TradeListingStage> = {
    ok: true;
    stage: S;
    request: NDKEvent;
    result: NDKEvent;
    order_id: string;
    bundle?: OrderBundle;
};

export type StageActionErr<S extends TradeListingStage> = {
    ok: false;
    stage: S;
    error: TradeFlowServiceError;
    request?: NDKEvent;
};

export type StageActionResult<S extends TradeListingStage> = StageActionOk<S> | StageActionErr<S>;

export type AcceptOptions = {
    listing_id: string;
    order_id: string;
    timeout_ms?: number;
};

export type ConveyanceOptions = {
    listing_id: string;
    order_id: string;
    method: TradeListingConveyanceRequest["method"];
    timeout_ms?: number;
};

export type InvoiceOptions = {
    listing_id: string;
    order_id: string;
    timeout_ms?: number;
};

export type PaymentOptions = {
    listing_id: string;
    order_id: string;
    proof: TradeListingPaymentProofRequest["proof"];
    timeout_ms?: number;
};

export type FulfillmentOptions = {
    listing_id: string;
    order_id: string;
    timeout_ms?: number;
};

export type ReceiptOptions = {
    listing_id: string;
    order_id: string;
    note?: string;
    timeout_ms?: number;
};

export type CancelOptions = {
    listing_id: string;
    order_id: string;
    timeout_ms?: number;
};

export type RefundOptions = {
    listing_id: string;
    order_id: string;
    timeout_ms?: number;
};


export type StagePostInput =
    | { stage: TradeListingStage.Accept; opts: AcceptOptions }
    | { stage: TradeListingStage.Conveyance; opts: ConveyanceOptions }
    | { stage: TradeListingStage.Invoice; opts: InvoiceOptions }
    | { stage: TradeListingStage.Payment; opts: PaymentOptions }
    | { stage: TradeListingStage.Fulfillment; opts: FulfillmentOptions }
    | { stage: TradeListingStage.Receipt; opts: ReceiptOptions }
    | { stage: TradeListingStage.Cancel; opts: CancelOptions }
    | { stage: TradeListingStage.Refund; opts: RefundOptions };

export type StagePostOutput =
    | StageActionResult<TradeListingStage.Accept>
    | StageActionResult<TradeListingStage.Conveyance>
    | StageActionResult<TradeListingStage.Invoice>
    | StageActionResult<TradeListingStage.Payment>
    | StageActionResult<TradeListingStage.Fulfillment>
    | StageActionResult<TradeListingStage.Receipt>
    | StageActionErr<TradeListingStage.Cancel>
    | StageActionErr<TradeListingStage.Refund>;

export interface CreateTradeFlowServiceOptions {
    ndk: StoreWritable<typeof ndk>;
    ndk_user_store: () => NDKUser;
    authors?: string[];
    kinds?: number[];
    default_timeout_ms?: number;
}

export interface TradeFlowService {
    listings: SvelteMap<string, TradeListingBundle>;

    get_latest_update(): NDKEvent | undefined;

    set_filter_authors(authors?: string[] | undefined): void;
    set_filter_kinds(kinds: number[]): void;

    get_trade_listing_bundle(listing_id: string): TradeListingBundle | undefined;
    get_order_bundle(listing_id: string, order_id: string): OrderBundle | undefined;
    is_loading(event_id: string): boolean;

    on_event(ev: NDKEvent): void;

    order_request(
        listing_id: string,
        payload: TradeListingOrderRequestPayload,
        timeout_ms?: number
    ): Promise<OrderRequestResult>;

    accept_request(opts: AcceptOptions): Promise<StageActionResult<TradeListingStage.Accept>>;
    conveyance_request(
        opts: ConveyanceOptions
    ): Promise<StageActionResult<TradeListingStage.Conveyance>>;
    invoice_request(opts: InvoiceOptions): Promise<StageActionResult<TradeListingStage.Invoice>>;
    payment_request(opts: PaymentOptions): Promise<StageActionResult<TradeListingStage.Payment>>;
    fulfillment_request(
        opts: FulfillmentOptions
    ): Promise<StageActionResult<TradeListingStage.Fulfillment>>;
    receipt_request(opts: ReceiptOptions): Promise<StageActionResult<TradeListingStage.Receipt>>;

    post(input: StagePostInput): Promise<StagePostOutput>;

    destroy(): void;
}
