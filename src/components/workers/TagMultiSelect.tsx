"use client";

import { useEffect, useMemo, useState } from "react";
import AutocompleteField from "@/components/ui/AutocompleteField";
import { fetchTags, type WorkerTag } from "@/lib/worker-tags";

interface TagMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}

export default function TagMultiSelect({
  selectedIds,
  onChange,
  disabled = false,
  id = "worker-tag-select",
  label = "Select Tags",
}: TagMultiSelectProps) {
  const [tags, setTags] = useState<WorkerTag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTags().then(({ tags: rows, error }) => {
      if (cancelled) return;
      setTags(rows);
      setLoadError(error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => tags.map((tag) => ({ id: tag.id, label: tag.name })),
    [tags]
  );

  return (
    <div className="space-y-1">
      <AutocompleteField
        id={id}
        label={label}
        mode="multiple"
        selected={selectedIds}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder="Search tags…"
        emptyMessage="No tags yet. Create them under Organisation → Tags."
        noMatchesMessage="No tags match your search."
      />
      {loadError ? <p className="text-xs text-red-600">{loadError}</p> : null}
    </div>
  );
}
