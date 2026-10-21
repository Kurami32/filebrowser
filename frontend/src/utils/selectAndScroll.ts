import { mutations, state } from "@/store/index.ts";
import { base64Encode } from "@/utils/url.js";

/** Selects the item at `index` in the current listing and scrolls it into view. False when its element isn't rendered yet. */
export function selectAndScrollToIndex(index: number, replaceSelection = false): boolean {
  const name = state.req.items.at(index)?.name;
  if (name === undefined) return false;
  if (replaceSelection) {
    mutations.resetSelected();
  }
  mutations.addSelected(index);
  const el = document.getElementById(base64Encode(encodeURIComponent(name)));
  if (!el) return false;
  el.scrollIntoView({ behavior: "instant", block: "center" });
  return true;
}
