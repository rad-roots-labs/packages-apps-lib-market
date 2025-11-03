<script lang="ts">
    import {
        ProfileNetworkPublicKey,
        type IProfileViewNetworkNip05,
    } from "$root";

    let {
        basis,
    }: {
        basis: IProfileViewNetworkNip05;
    } = $props();

    let public_key: string | undefined = $state(undefined);
</script>

{#if public_key}
    <ProfileNetworkPublicKey basis={{ public_key }} />
{:else}
    <p class={`font-sans font-[400] text-base text-ly0-gl`}>
        {`could not find a public key for ${basis.nip05}`}
    </p>
{/if}
