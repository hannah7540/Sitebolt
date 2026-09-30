"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import GlobalSearchOverlay from "@/components/search/GlobalSearchOverlay";
import {
  EMPTY_GLOBAL_SEARCH_RESULTS,
  runGlobalSearch,
  type GlobalSearchResults,
} from "@/lib/global-search";

interface GlobalSearchContextValue {
  query: string;
  submittedQuery: string;
  isOpen: boolean;
  loading: boolean;
  results: GlobalSearchResults;
  setQuery: (value: string) => void;
  clearQuery: () => void;
  submitSearch: (value?: string) => Promise<void>;
  closeSearch: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function useGlobalSearch(): GlobalSearchContextValue | null {
  return useContext(GlobalSearchContext);
}

export default function GlobalSearchProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>(
    EMPTY_GLOBAL_SEARCH_RESULTS
  );

  const closeSearch = useCallback(() => {
    setIsOpen(false);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery("");
  }, []);

  const submitSearch = useCallback(async (value?: string) => {
    const next = (value ?? query).trim();
    if (!next) return;
    setQuery(next);
    setSubmittedQuery(next);
    setIsOpen(true);
    setLoading(true);
    try {
      setResults(await runGlobalSearch(next));
    } catch {
      setResults(EMPTY_GLOBAL_SEARCH_RESULTS);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const value = useMemo(
    () => ({
      query,
      submittedQuery,
      isOpen,
      loading,
      results,
      setQuery,
      clearQuery,
      submitSearch,
      closeSearch,
    }),
    [query, submittedQuery, isOpen, loading, results, clearQuery, submitSearch, closeSearch]
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      {isOpen ? (
        <GlobalSearchOverlay
          query={submittedQuery}
          results={results}
          loading={loading}
          onClose={closeSearch}
        />
      ) : null}
    </GlobalSearchContext.Provider>
  );
}
