"use client";

import { ChevronDown, ChevronUp, GripVertical, Loader2, RotateCcw, Save, Settings2 } from "lucide-react";
import { DASHBOARD_WIDGET_LABELS } from "@/lib/dashboard-layouts";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface DashboardCustomizeToolbarProps {
  editMode: boolean;
  saving: boolean;
  message: string | null;
  hiddenWidgetIds: string[];
  showHiddenDrawer: boolean;
  onToggleEditMode: () => void;
  onSaveLayout: () => void;
  onResetToDefault: () => void;
  onToggleHiddenDrawer: () => void;
  onRestoreWidget: (widgetId: string) => void;
}

export default function DashboardCustomizeToolbar({
  editMode,
  saving,
  message,
  hiddenWidgetIds,
  showHiddenDrawer,
  onToggleEditMode,
  onSaveLayout,
  onResetToDefault,
  onToggleHiddenDrawer,
  onRestoreWidget,
}: DashboardCustomizeToolbarProps) {
  const hiddenCount = hiddenWidgetIds.length;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggleEditMode}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition",
            editMode
              ? "border-orange-300 bg-orange-50 text-orange-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-orange-50 hover:text-orange-600"
          )}
          aria-pressed={editMode}
        >
          <Settings2 className="h-4 w-4" />
          {editMode ? "Exit Customize" : "Customize Layout"}
        </button>

        {editMode ? (
          <>
            <button
              type="button"
              onClick={onToggleHiddenDrawer}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add / Restore Hidden Widgets
              {hiddenCount > 0 ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">{hiddenCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void onResetToDefault()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Default
            </button>
            <button
              type="button"
              onClick={() => void onSaveLayout()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Layout
            </button>
          </>
        ) : null}
      </div>

      {editMode ? (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Edit mode is active. Reorder widgets, hide sections you don&apos;t need, then save your layout.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      {editMode && showHiddenDrawer ? (
        <HiddenWidgetRestoreList
          hiddenWidgetIds={hiddenWidgetIds}
          onRestore={onRestoreWidget}
        />
      ) : null}
    </div>
  );
}

interface DashboardWidgetFrameProps {
  widgetId: string;
  editMode: boolean;
  isVisible: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: (visible: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function DashboardWidgetFrame({
  widgetId,
  editMode,
  isVisible,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  children,
  className,
}: DashboardWidgetFrameProps) {
  if (!editMode && !isVisible) return null;

  const label = DASHBOARD_WIDGET_LABELS[widgetId] ?? widgetId;

  return (
    <div
      data-widget-id={widgetId}
      className={cn(
        "relative",
        editMode && !isVisible && "opacity-60",
        className
      )}
    >
      {editMode ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-orange-200 bg-orange-50/70 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
            <GripVertical className="h-4 w-4" />
            {label}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Up
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Down
            </button>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>Visible</span>
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => onToggleVisibility(e.target.checked)}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
            </label>
          </div>
        </div>
      ) : null}
      {isVisible ? children : (
        <div className={`${cardClass} border-dashed p-4 text-sm text-slate-500`}>
          {label} is hidden. Turn visibility on to restore it.
        </div>
      )}
    </div>
  );
}

interface HiddenWidgetRestoreListProps {
  hiddenWidgetIds: string[];
  onRestore: (widgetId: string) => void;
}

export function HiddenWidgetRestoreList({
  hiddenWidgetIds,
  onRestore,
}: HiddenWidgetRestoreListProps) {
  if (hiddenWidgetIds.length === 0) return null;

  return (
    <div className={`${cardClass} p-4`}>
      <p className="mb-3 text-sm font-semibold text-slate-800">Hidden Widgets</p>
      <div className="space-y-2">
        {hiddenWidgetIds.map((widgetId) => (
          <div
            key={widgetId}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <span className="text-sm text-slate-700">
              {DASHBOARD_WIDGET_LABELS[widgetId] ?? widgetId}
            </span>
            <button
              type="button"
              onClick={() => onRestore(widgetId)}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
