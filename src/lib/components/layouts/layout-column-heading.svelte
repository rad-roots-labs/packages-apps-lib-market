<script lang="ts">
    import { Flex } from "@radroots/apps-lib";
    import type { Snippet } from "svelte";

    let {
        heading,
        subheading,
        footer,
    }: {
        heading: Snippet;
        subheading: Snippet;
        footer?: Snippet;
    } = $props();
</script>

<div class={`flex flex-col w-full pb-2 justify-start items-start`}>
    <div
        class={`flex flex-row h-[120px] w-full px-4 gap-4 justify-center items-center`}
    >
        <div
            class={`flex flex-row flex-shrink-0 h-[96px] w-[96px] justify-center items-center bg-lime-500/20 rounded-sm`}
        >
            <Flex />
        </div>
        <div
            class={`flex flex-col h-full w-full gap-2 justify-center items-start`}
        >
            {@render heading()}
        </div>
    </div>
    <div class={`flex flex-col w-full px-4 py-1 justify-center items-start`}>
        {@render subheading()}
    </div>
</div>
