"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDefaultWidgets,
  getHiddenWidgets,
  getVisibleWidgets,
  moveWidget,
  normalizeWidgetOrder,
  setWidgetVisibility,
  type DashboardType,
  type DashboardWidgetConfig,
} from "@/lib/dashboard-layouts";
import {
  deleteDashboardLayout,
  fetchDashboardLayout,
  saveDashboardLayout,
} from "@/lib/dashboard-layout-service";
import type { SecurityRole } from "@/lib/security-roles";

interface UseDashboardLayoutOptions {
  userId: string | null;
  role: SecurityRole;
  dashboardType: DashboardType;
  projectId?: string | null;
  canCustomize: boolean;
}

export function useDashboardLayout({
  userId,
  role,
  dashboardType,
  projectId = null,
  canCustomize,
}: UseDashboardLayoutOptions) {
  const defaults = useMemo(() => getDefaultWidgets(dashboardType), [dashboardType]);
  const [layout, setLayout] = useState<DashboardWidgetConfig[]>(defaults);
  const [draftLayout, setDraftLayout] = useState<DashboardWidgetConfig[]>(defaults);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLayout = useCallback(async () => {
    setLoading(true);
    if (!userId) {
      setLayout(defaults);
      setDraftLayout(defaults);
      setLoading(false);
      return;
    }

    const saved = await fetchDashboardLayout(userId, dashboardType, projectId);
    const resolved = normalizeWidgetOrder(saved, defaults);
    setLayout(resolved);
    setDraftLayout(resolved);
    setLoading(false);
  }, [userId, dashboardType, projectId, defaults]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  const activeLayout = editMode ? draftLayout : layout;
  const orderedWidgets = useMemo(
    () => [...activeLayout].sort((a, b) => a.position - b.position),
    [activeLayout]
  );
  const visibleWidgets = useMemo(
    () => getVisibleWidgets(activeLayout),
    [activeLayout]
  );
  const hiddenWidgets = useMemo(
    () => getHiddenWidgets(activeLayout),
    [activeLayout]
  );

  const enterEditMode = () => {
    if (!canCustomize) return;
    setDraftLayout(layout);
    setEditMode(true);
    setMessage(null);
  };

  const cancelEditMode = () => {
    setDraftLayout(layout);
    setEditMode(false);
    setMessage(null);
  };

  const toggleEditMode = () => {
    if (editMode) cancelEditMode();
    else enterEditMode();
  };

  const moveWidgetUp = (widgetId: string) => {
    setDraftLayout((current) => moveWidget(current, widgetId, "up"));
  };

  const moveWidgetDown = (widgetId: string) => {
    setDraftLayout((current) => moveWidget(current, widgetId, "down"));
  };

  const toggleWidgetVisibility = (widgetId: string, isVisible: boolean) => {
    setDraftLayout((current) => setWidgetVisibility(current, widgetId, isVisible));
  };

  const restoreHiddenWidget = (widgetId: string) => {
    toggleWidgetVisibility(widgetId, true);
  };

  const saveLayout = async () => {
    if (!userId) {
      setLayout(draftLayout);
      setEditMode(false);
      setMessage("Layout saved locally.");
      return;
    }

    setSaving(true);
    setMessage(null);
    const { error } = await saveDashboardLayout({
      user_id: userId,
      role,
      dashboard_type: dashboardType,
      project_id: projectId,
      widget_order: draftLayout,
    });
    setSaving(false);

    if (error) {
      setMessage(error);
      return;
    }

    setLayout(draftLayout);
    setEditMode(false);
    setMessage("Layout saved.");
  };

  const resetToDefault = async () => {
    const next = getDefaultWidgets(dashboardType);
    setDraftLayout(next);
    if (!editMode) {
      setLayout(next);
    }

    if (userId) {
      setSaving(true);
      await deleteDashboardLayout(userId, dashboardType, projectId);
      setSaving(false);
    }

    if (!editMode) {
      setMessage("Layout reset to default.");
    }
  };

  const isWidgetVisible = (widgetId: string) =>
    activeLayout.find((widget) => widget.id === widgetId)?.isVisible ?? true;

  const getWidgetPosition = (widgetId: string) => {
    const sorted = [...activeLayout].sort((a, b) => a.position - b.position);
    return sorted.findIndex((widget) => widget.id === widgetId);
  };

  const canMoveUp = (widgetId: string) => getWidgetPosition(widgetId) > 0;
  const canMoveDown = (widgetId: string) => {
    const index = getWidgetPosition(widgetId);
    return index >= 0 && index < activeLayout.length - 1;
  };

  return {
    loading,
    saving,
    editMode,
    message,
    orderedWidgets,
    visibleWidgets,
    hiddenWidgets,
    toggleEditMode,
    cancelEditMode,
    saveLayout,
    resetToDefault,
    moveWidgetUp,
    moveWidgetDown,
    toggleWidgetVisibility,
    restoreHiddenWidget,
    isWidgetVisible,
    canMoveUp,
    canMoveDown,
  };
}
