<script lang="ts">
    import { Flex, Glyph } from "@radroots/apps-lib";
    import type { CallbackPromise } from "@radroots/utils";

    let view_index = $state(0);
</script>

<div
    class={`grid grid-cols-12 flex flex-row h-[44px] w-full justify-around items-center border-b-line border-b-cloak_grey/20`}
>
    {#snippet button(index: number, icon: string, callback: CallbackPromise)}
        <button
            class={`relative col-span-4 flex flex-col h-full justify-center items-center`}
            onclick={async () => {
                view_index = index;
                await callback();
            }}
        >
            <Glyph
                basis={{
                    classes: `text-black_panther`,
                    size: `sm`,
                    key: icon,
                }}
            />
            {#if view_index === index}
                <div
                    class={`absolute bottom-0 left-0 flex flex-row h-[2px] w-full justify-start items-center bg-cloak_grey/40 el-re`}
                >
                    <Flex />
                </div>
            {/if}
        </button>
    {/snippet}
    {@render button(0, `grid-nine`, async () => {})}
    {@render button(1, `monitor-play`, async () => {})}
    {@render button(2, `user-rectangle`, async () => {})}
</div>
