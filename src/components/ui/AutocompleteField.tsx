"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import DropdownPanel from "@/components/ui/DropdownPanel";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

export interface AutocompleteOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

type AutocompleteFieldBaseProps = {
  options: AutocompleteOption[];
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  noMatchesMessage?: string;
  id?: string;
  pinnedOption?: AutocompleteOption | null;
};

type AutocompleteFieldSingleProps = AutocompleteFieldBaseProps & {
  mode?: "single";
  selected: string | null;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
};

type AutocompleteFieldMultipleProps = AutocompleteFieldBaseProps & {
  mode: "multiple";
  selected: string[];
  onChange: (ids: string[]) => void;
};

export type AutocompleteFieldProps =
  | AutocompleteFieldSingleProps
  | AutocompleteFieldMultipleProps;

function optionMatchesQuery(option: AutocompleteOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    (option.description ?? "").toLowerCase().includes(needle) ||
    option.id.toLowerCase().includes(needle)
  );
}

export default function AutocompleteField(props: AutocompleteFieldProps) {
  const {
    options,
    label,
    required = false,
    placeholder = "Search…",
    disabled = false,
    emptyMessage = "No options available.",
    noMatchesMessage = "No matches.",
    id,
    pinnedOption = null,
  } = props;

  const mode = props.mode === "multiple" ? "multiple" : "single";
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userTyped, setUserTyped] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const selectedIds =
    props.mode === "multiple"
      ? props.selected
      : props.selected
        ? [props.selected]
        : [];

  const selectedOptions = useMemo(
    () =>
      selectedIds
        .map((optionId) => options.find((option) => option.id === optionId))
        .filter((option): option is AutocompleteOption => option != null),
    [options, selectedIds]
  );

  const singleSelected = mode === "single" ? selectedOptions[0] ?? null : null;
  const pinnedSelected =
    props.mode !== "multiple" &&
    pinnedOption != null &&
    (props.selected === pinnedOption.id || props.selected == null);

  const displayValue = useMemo(() => {
    if (mode === "multiple") return query;
    if (open && userTyped) return query;
    if (open) return query;
    if (singleSelected) return singleSelected.label;
    if (pinnedSelected && pinnedOption) return pinnedOption.label;
    return "";
  }, [
    mode,
    open,
    pinnedOption,
    pinnedSelected,
    query,
    singleSelected,
    userTyped,
  ]);

  const visibleOptions = useMemo(() => {
    const filtered = userTyped
      ? options.filter((option) => optionMatchesQuery(option, query))
      : options;
    return pinnedOption ? [pinnedOption, ...filtered] : filtered;
  }, [options, pinnedOption, query, userTyped]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setUserTyped(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(0);
  }, [open, query, userTyped]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>("[data-highlighted=true]");
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open, visibleOptions]);

  const selectOption = (option: AutocompleteOption) => {
    if (option.disabled) return;

    if (props.mode === "multiple") {
      const next = props.selected.includes(option.id)
        ? props.selected.filter((value) => value !== option.id)
        : [...props.selected, option.id];
      props.onChange(next);
      setQuery("");
      setUserTyped(false);
      inputRef.current?.focus();
      return;
    }

    if (pinnedOption && option.id === pinnedOption.id) {
      props.onChange(null);
    } else {
      props.onChange(option.id);
    }
    closeDropdown();
  };

  const clearSingle = () => {
    if (props.mode === "multiple" || props.allowClear === false) return;
    props.onChange(null);
    setQuery("");
    setUserTyped(false);
    inputRef.current?.focus();
    setOpen(true);
  };

  const removeChip = (optionId: string) => {
    if (props.mode !== "multiple") return;
    props.onChange(props.selected.filter((value) => value !== optionId));
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((current) =>
        visibleOptions.length === 0 ? 0 : (current + 1) % visibleOptions.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((current) =>
        visibleOptions.length === 0
          ? 0
          : (current - 1 + visibleOptions.length) % visibleOptions.length
      );
      return;
    }

    if (event.key === "Enter") {
      if (!open || visibleOptions.length === 0) return;
      event.preventDefault();
      const option = visibleOptions[highlightIndex];
      if (option) selectOption(option);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="space-y-2">
      {label ? (
        <label className={labelClass} htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}

      {mode === "multiple" && selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900"
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                onClick={() => removeChip(option.id)}
                disabled={disabled}
                className="rounded-full p-0.5 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                aria-label={`Remove ${option.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div ref={triggerRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={id ? `${id}-results` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            if (mode === "single") {
              setQuery(singleSelected?.label ?? pinnedOption?.label ?? "");
              setUserTyped(false);
            }
          }}
          onChange={(event) => {
            setUserTyped(true);
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          className={cn(
            inputClass,
            "pl-9 pr-10",
            disabled && "cursor-not-allowed opacity-60"
          )}
        />
        {mode === "single" &&
        singleSelected &&
        props.mode !== "multiple" &&
        props.allowClear !== false ? (
          <button
            type="button"
            onClick={clearSingle}
            disabled={disabled}
            className="absolute right-8 top-1/2 z-10 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label={`Clear ${singleSelected.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </div>

      <DropdownPanel
        open={open}
        triggerRef={triggerRef}
        maxHeight={320}
        onClose={closeDropdown}
      >
        <div
          ref={listRef}
          id={id ? `${id}-results` : undefined}
          className="max-h-72 overflow-y-auto p-2"
          role="listbox"
          aria-multiselectable={mode === "multiple"}
        >
          {options.length === 0 && !pinnedOption ? (
            <p className="px-2 py-3 text-sm text-slate-500">{emptyMessage}</p>
          ) : visibleOptions.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">{noMatchesMessage}</p>
          ) : (
            visibleOptions.map((option, index) => {
              const selected =
                props.mode === "multiple"
                  ? props.selected.includes(option.id)
                  : pinnedOption && option.id === pinnedOption.id
                    ? props.selected == null || props.selected === pinnedOption.id
                    : props.selected === option.id;
              const highlighted = index === highlightIndex;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-highlighted={highlighted || undefined}
                  disabled={disabled || option.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => selectOption(option)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition",
                    highlighted ? "bg-orange-50" : "hover:bg-orange-50",
                    selected && "bg-orange-50/70",
                    option.disabled && "opacity-60"
                  )}
                >
                  {mode === "multiple" ? (
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="block truncate text-xs text-slate-500">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {mode === "single" && selected ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DropdownPanel>
    </div>
  );
}
