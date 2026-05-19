/**
 * Search context definition.
 *
 * Separated from the provider component to satisfy
 * react-refresh/only-export-components.
 */

import { createContext } from "react";

export interface SearchContextValue {
  /** Current search query */
  query: string;
  /** Update the search query */
  setQuery: (query: string) => void;
}

export const SearchContext = createContext<SearchContextValue | undefined>(
  undefined,
);
