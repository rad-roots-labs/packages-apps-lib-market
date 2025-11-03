<script lang="ts">
    import {
        type IProfileViewNetwork,
        ProfileNetworkNip05,
        ProfileNetworkNpub,
        ProfileNetworkPublicKey,
    } from "$root";

    let { basis }: { basis: IProfileViewNetwork } = $props();
</script>

{#if basis.unknown && `public_key` in basis.unknown}
    <ProfileNetworkPublicKey basis={basis.unknown} />
{:else if basis.unknown && `npub` in basis.unknown}
    <ProfileNetworkNpub basis={basis.unknown} />
{:else if basis.unknown && `nip05` in basis.unknown}
    <ProfileNetworkNip05 basis={basis.unknown} />
{:else}
    <p class={`font-sans font-[400] text-base text-ly0-gl`}>
        {`profile not found`}
    </p>
{/if}
