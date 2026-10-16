import { useEffect } from "react";
import { BRAND } from "./brand";

/** Sets the document title and description for the current page. */
export function usePageMeta(title: string | null, description?: string): void {
  useEffect(() => {
    document.title = title ? `${title} | ${BRAND.name}` : BRAND.name;
    if (description) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", description);
    }
  }, [title, description]);
}
