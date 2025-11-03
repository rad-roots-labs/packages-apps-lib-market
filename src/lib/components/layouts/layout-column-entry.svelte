<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        children,
        basis,
    }: { children: Snippet; basis?: { classes?: string } } = $props();
</script>

<div
    class={`flex flex-col w-full desktop:w-[700px] justify-start items-start ${basis?.classes}`}
>
    {@render children()}
</div>
