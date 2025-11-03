<script lang="ts">
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();
</script>

<div
    class={`flex flex-col w-full desktop:p-8 gap-4 desktop:gap-8 justify-center items-center`}
>
    {@render children()}
</div>
