import type { PageLoadProfileData } from "$root";

export type IProfileView = IProfileViewIndexed | IProfileViewNetwork;

export type IProfileViewIndexed = {
    indexed: PageLoadProfileData;
};

export type IProfileViewNetwork = {
    unknown?: IProfileViewNetworkPublicKey | IProfileViewNetworkNpub | IProfileViewNetworkNip05;
};

export type IProfileViewNetworkPublicKey = {
    public_key: string;
};

export type IProfileViewNetworkNpub = {
    npub: string;
};

export type IProfileViewNetworkNip05 = {
    nip05: string;
};