import type { RadrootsListingEventMetadata, RadrootsProfileEventMetadata } from "@radroots/events-bindings";

export type PageLoadProfileData = {
    public_key: string;
    npub?: string;
    events: PageLoadProfileDataEvents;
};

export type PageLoadProfileDataEvents =
    (
        {
            profile: RadrootsProfileEventMetadata;
        } | {
            profile: RadrootsProfileEventMetadata;
            listings: RadrootsListingEventMetadata[];
        }
    );
