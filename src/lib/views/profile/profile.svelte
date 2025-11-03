<script lang="ts">
    import { type IProfileView, ProfileIndexed, ProfileNetwork } from "$root";

    let {
        basis,
    }: {
        basis: IProfileView;
    } = $props();

    $effect(() => {
        console.log(JSON.stringify(basis, null, 4), `basis`);
    });
</script>

{#if `indexed` in basis}
    <ProfileIndexed {basis} />
{:else if `unknown` in basis && basis.unknown}
    <ProfileNetwork {basis} />
{/if}
