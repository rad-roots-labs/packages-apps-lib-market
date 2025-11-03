<script lang="ts">
    import {
        type IProfileViewNetworkNpub,
        ProfileNetworkPublicKey,
    } from "$root";
    import { lib_nostr_npub_decode } from "@radroots/utils-nostr";
    import { error } from "@sveltejs/kit";
    import { onMount } from "svelte";

    let {
        basis,
    }: {
        basis: IProfileViewNetworkNpub;
    } = $props();

    let public_key: string | undefined = $state(undefined);

    onMount(async () => {
        public_key = lib_nostr_npub_decode(basis.npub);
        if (!public_key) error(404, `invalid:public_key:${public_key}`);
    });
</script>

{#if public_key}
    <ProfileNetworkPublicKey basis={{ public_key }} />
{:else}
    <p class={`font-sans font-[400] text-base text-ly0-gl`}>
        {`not a valid npub ${basis.npub}`}
    </p>
{/if}
