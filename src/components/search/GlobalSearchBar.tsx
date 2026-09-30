"use client";

import { FormEvent, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useGlobalSearch } from "@/components/search/GlobalSearchProvider";
import { cn } from "@/lib/utils";

export default function GlobalSearchBar() {
  const search = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!search?.isOpen) return;
    inputRef.current?.focus();
  }, [search?.isOpen]);

  if (!search) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void search.submitSearch();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto hidden w-[min(480px,42vw)] min-w-[min(380px,100%)] max-w-[480px] md:flex"
      role="search"
    >
      <label className="relative flex w-full items-center">
        <span className="sr-only">Search workers, plant, fleet, ITPs, ITCs, projects</span>
        <button
          type="submit"
          className="absolute left-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-orange-50 hover:text-orange-600"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          type="search"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          placeholder="Search workers, plant, fleet, ITPs, ITCs, projects... (Press Enter)"
          className={cn(
            "h-10 w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-10 text-sm text-slate-900 outline-none transition",
            "placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
          )}
        />
        {search.query ? (
          <button
            type="button"
            onClick={search.clearQuery}
            className="absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>
    </form>
  );
}
