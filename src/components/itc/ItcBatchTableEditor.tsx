"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  applySpecRuleToBatchItem,
  groupBatchItemsByServiceType,
  type ItcBatchItemDraft,
  type ItcServiceSpecRule,
} from "@/lib/itc-batch-templates";
import { cardClass, inputClass } from "@/lib/ui-classes";

interface ItcBatchTableEditorProps {
  items: ItcBatchItemDraft[];
  specRules: ItcServiceSpecRule[];
  onChange: (items: ItcBatchItemDraft[]) => void;
}

function updateItem(
  items: ItcBatchItemDraft[],
  itemId: string,
  patch: Partial<ItcBatchItemDraft>
): ItcBatchItemDraft[] {
  return items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
}

export default function ItcBatchTableEditor({
  items,
  specRules,
  onChange,
}: ItcBatchTableEditorProps) {
  const grouped = useMemo(() => groupBatchItemsByServiceType(items), [items]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const materialOptionsFor = (serviceType: string) =>
    specRules.filter((rule) => rule.service_type === serviceType);

  const handleMaterialChange = (item: ItcBatchItemDraft, materialAndSize: string) => {
    const rule = specRules.find(
      (row) =>
        row.service_type === item.service_type && row.material_and_size === materialAndSize
    );
    if (!rule) {
      onChange(updateItem(items, item.id, { material_and_size: materialAndSize }));
      return;
    }
    onChange(
      updateItem(items, item.id, applySpecRuleToBatchItem(item, rule))
    );
  };

  if (items.length === 0) {
    return (
      <div className={cardClass}>
        <div className="p-8 text-center text-sm text-slate-500">
          Drop pins on the drawing to populate the batch table.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map((group, sectionIndex) => {
        const collapsedKey = group.serviceType;
        const isCollapsed = collapsed[collapsedKey] ?? false;

        return (
          <div key={group.serviceType} className={cardClass}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) => ({
                  ...current,
                  [collapsedKey]: !isCollapsed,
                }))
              }
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  Section {sectionIndex + 1}: {group.serviceType}
                </p>
                <p className="text-xs text-slate-500">{group.items.length} row(s)</p>
              </div>
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {!isCollapsed ? (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Zone</th>
                      <th className="px-3 py-2">Plan Rev</th>
                      <th className="px-3 py-2">Material & Size</th>
                      <th className="px-3 py-2">Length (m)</th>
                      <th className="px-3 py-2">Upstream Pit</th>
                      <th className="px-3 py-2">Downstream Pit</th>
                      <th className="px-3 py-2">Conduits</th>
                      <th className="px-3 py-2">Specs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">
                          <input
                            value={item.zone}
                            onChange={(e) =>
                              onChange(updateItem(items, item.id, { zone: e.target.value }))
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={item.plan_rev}
                            onChange={(e) =>
                              onChange(updateItem(items, item.id, { plan_rev: e.target.value }))
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="min-w-[220px] px-3 py-2">
                          <select
                            value={item.material_and_size}
                            onChange={(e) => handleMaterialChange(item, e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select material & size</option>
                            {materialOptionsFor(item.service_type).map((rule) => (
                              <option key={rule.id} value={rule.material_and_size}>
                                {rule.material_and_size}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={item.length_between_structures_m ?? ""}
                            onChange={(e) =>
                              onChange(
                                updateItem(items, item.id, {
                                  length_between_structures_m: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={item.upstream_pit_number}
                            onChange={(e) =>
                              onChange(
                                updateItem(items, item.id, {
                                  upstream_pit_number: e.target.value,
                                })
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={item.downstream_pit_number}
                            onChange={(e) =>
                              onChange(
                                updateItem(items, item.id, {
                                  downstream_pit_number: e.target.value,
                                })
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={item.number_of_conduits ?? ""}
                            onChange={(e) =>
                              onChange(
                                updateItem(items, item.id, {
                                  number_of_conduits: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              )
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          <p>H: {item.min_horizontal_sep_mm ?? "—"} mm</p>
                          <p>V: {item.min_vertical_sep_mm ?? "—"} mm</p>
                          <p>Bed: {item.min_bedding_mm ?? "—"} mm</p>
                          <p>Cover: {item.min_cover_mm ?? "—"} mm</p>
                          <p>{item.bedding_and_overlay_material ?? "—"}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
