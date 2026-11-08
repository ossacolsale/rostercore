import { createContext, useContext } from "react";
export type CatalogueKind =
  | "employeeType"
  | "attribute"
  | "group"
  | "pattern"
  | "shift"
  | "profile";
export const CatalogueContext = createContext<
  ((kind: CatalogueKind) => void) | null
>(null);
export function useCatalogue() {
  return useContext(CatalogueContext);
}
