<script lang="ts">
    import type { Snippet } from "svelte";

    let { row1, row2, row3 }: { row1: Snippet; row2: Snippet; row3: Snippet } =
        $props();
</script>

<div class={`flex flex-row w-full gap-2 justify-start items-center`}>
    {@render row1()}
</div>
<div class={`flex flex-col w-full gap-1 justify-start items-center`}>
    <div class={`flex flex-row w-full justify-start items-center`}>
        {@render row2()}
    </div>
    <div class={`flex flex-row w-full gap-2 justify-start items-center`}>
        {@render row3()}
    </div>
</div>
