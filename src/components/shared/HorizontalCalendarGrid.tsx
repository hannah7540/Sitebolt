"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  CALENDAR_DAY_COLUMN_WIDTH,
  CALENDAR_WEEK_EXTEND,
  CALENDAR_WORKER_COLUMN_WIDTH,
  formatCalendarScrollRange,
  formatWeekRange,
  startOfWeekMonday,
  type CalendarDay,
} from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";

const SCROLL_EDGE_THRESHOLD = CALENDAR_DAY_COLUMN_WIDTH * 7;
export const SCROLL_EXTEND_DAYS = CALENDAR_WEEK_EXTEND * 7;

export interface PinnedCalendarColumn<T> {
  key: string;
  label: string;
  width: number;
  renderCell: (item: T) => ReactNode;
}

export interface HorizontalCalendarGridProps<T> {
  calendarDays: CalendarDay[];
  calendarRangeStart: Date;
  calendarRangeEnd: Date;
  loading?: boolean;
  items: T[];
  getItemId: (item: T) => string;
  selectedItemId: string;
  onSelectItem: (id: string) => void;
  stickyColumnLabel: string;
  stickyColumnIcon: ReactNode;
  renderStickyColumn: (item: T) => ReactNode;
  pinnedExtraColumns?: PinnedCalendarColumn<T>[];
  renderDayCell: (item: T, day: CalendarDay, dayIndex: number) => ReactNode;
  getRowClassName?: (item: T) => string | undefined;
  emptyMessage: string;
  renderHeaderDayExtra?: (day: CalendarDay) => ReactNode;
  onRangeExtendPast?: () => void;
  onRangeExtendFuture?: () => void;
  scrollAdjustRef?: React.MutableRefObject<number>;
  onFocusedWeekChange?: (weekStart: Date) => void;
  stickyColumnWidth?: number;
  loadingMessage?: string;
  /** When true, Mon columns get week-start styling and prev/next week scrolls 5 days. */
  weekdaysOnly?: boolean;
}

export default function HorizontalCalendarGrid<T>({
  calendarDays,
  calendarRangeStart,
  calendarRangeEnd,
  loading = false,
  items,
  getItemId,
  selectedItemId,
  onSelectItem,
  stickyColumnLabel,
  stickyColumnIcon,
  renderStickyColumn,
  pinnedExtraColumns = [],
  renderDayCell,
  getRowClassName,
  emptyMessage,
  renderHeaderDayExtra,
  onRangeExtendPast,
  onRangeExtendFuture,
  scrollAdjustRef,
  onFocusedWeekChange,
  stickyColumnWidth = CALENDAR_WORKER_COLUMN_WIDTH,
  loadingMessage = "Loading schedules…",
  weekdaysOnly = false,
}: HorizontalCalendarGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [focusedWeekStart, setFocusedWeekStart] = useState(() =>
    startOfWeekMonday(new Date())
  );

  const extraPinnedWidth = pinnedExtraColumns.reduce(
    (sum, column) => sum + column.width,
    0
  );
  const pinnedWidth = stickyColumnWidth + extraPinnedWidth;
  const gridWidth = pinnedWidth + calendarDays.length * CALENDAR_DAY_COLUMN_WIDTH;

  const updateScrollMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    setMaxScroll(Math.max(0, el.scrollWidth - el.clientWidth));
  }, []);

  const updateFocusedWeekFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || calendarDays.length === 0) return;

    const dayIndex = Math.min(
      calendarDays.length - 1,
      Math.floor(el.scrollLeft / CALENDAR_DAY_COLUMN_WIDTH)
    );
    const day = calendarDays[dayIndex];
    if (!day) return;

    const weekStart = startOfWeekMonday(day.date);
    setFocusedWeekStart(weekStart);
    onFocusedWeekChange?.(weekStart);
  }, [calendarDays, onFocusedWeekChange]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollMetrics();
    updateFocusedWeekFromScroll();

    if (el.scrollLeft < SCROLL_EDGE_THRESHOLD) {
      onRangeExtendPast?.();
    }
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - SCROLL_EDGE_THRESHOLD) {
      onRangeExtendFuture?.();
    }
  }, [
    onRangeExtendFuture,
    onRangeExtendPast,
    updateFocusedWeekFromScroll,
    updateScrollMetrics,
  ]);

  useLayoutEffect(() => {
    const adjust = scrollAdjustRef?.current ?? 0;
    if (!adjust || !scrollRef.current) return;

    scrollRef.current.scrollLeft += adjust;
    scrollAdjustRef!.current = 0;
    updateScrollMetrics();
    updateFocusedWeekFromScroll();
  }, [calendarDays.length, scrollAdjustRef, updateFocusedWeekFromScroll, updateScrollMetrics]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || hasScrolledToToday.current || calendarDays.length === 0) return;

    const todayIndex = calendarDays.findIndex((day) => day.isToday);
    if (todayIndex >= 0) {
      el.scrollLeft = Math.max(
        0,
        todayIndex * CALENDAR_DAY_COLUMN_WIDTH -
          el.clientWidth / 2 +
          CALENDAR_DAY_COLUMN_WIDTH / 2
      );
      hasScrolledToToday.current = true;
      updateScrollMetrics();
      updateFocusedWeekFromScroll();
    }
  }, [calendarDays, updateFocusedWeekFromScroll, updateScrollMetrics]);

  useEffect(() => {
    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    return () => window.removeEventListener("resize", updateScrollMetrics);
  }, [calendarDays.length, updateScrollMetrics]);

  const scrollByWeek = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * (weekdaysOnly ? 5 : 7) * CALENDAR_DAY_COLUMN_WIDTH,
      behavior: "smooth",
    });
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;

    const todayIndex = calendarDays.findIndex((day) => day.isToday);
    if (todayIndex < 0) return;

    el.scrollTo({
      left: Math.max(
        0,
        todayIndex * CALENDAR_DAY_COLUMN_WIDTH -
          el.clientWidth / 2 +
          CALENDAR_DAY_COLUMN_WIDTH / 2
      ),
      behavior: "smooth",
    });
  };

  const handleSliderChange = (value: number) => {
    const el = scrollRef.current;
    if (!el || maxScroll <= 0) return;
    el.scrollLeft = (value / 100) * maxScroll;
  };

  const scrollPercent = maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {loading ? (
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> {loadingMessage}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="calendar-scroll-x max-h-[70vh] overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ minWidth: gridWidth }}>
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
              style={{ width: stickyColumnWidth }}
            >
              {stickyColumnIcon}
              {stickyColumnLabel}
            </div>

            {pinnedExtraColumns.map((column, index) => {
              const leftOffset =
                stickyColumnWidth +
                pinnedExtraColumns
                  .slice(0, index)
                  .reduce((sum, item) => sum + item.width, 0);
              const isLastPinned = index === pinnedExtraColumns.length - 1;

              return (
                <div
                  key={column.key}
                  className={cn(
                    "sticky z-20 flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500",
                    isLastPinned && "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                  )}
                  style={{ left: leftOffset, width: column.width }}
                >
                  {column.label}
                </div>
              );
            })}

            {calendarDays.map((day, index) => {
              const isWeekStart = weekdaysOnly
                ? day.date.getDay() === 1
                : index % 7 === 0;
              const showMonthLabel =
                isWeekStart &&
                (index === 0 ||
                  day.date.getMonth() !== calendarDays[index - 1].date.getMonth());

              return (
                <div
                  key={day.iso}
                  className={cn(
                    "shrink-0 border-r border-slate-200 px-1 py-2 text-center last:border-r-0",
                    isWeekStart && "border-l-2 border-l-orange-200",
                    day.isToday &&
                      "bg-orange-500/10 ring-1 ring-inset ring-orange-400/50"
                  )}
                  style={{ width: CALENDAR_DAY_COLUMN_WIDTH }}
                >
                  {showMonthLabel ? (
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-orange-500">
                      {day.date.toLocaleDateString("en-AU", { month: "short" })}
                    </p>
                  ) : (
                    <p className="text-[9px] text-transparent select-none">—</p>
                  )}
                  <p className="text-xs font-semibold text-slate-500">{day.dayName}</p>
                  <p
                    className={cn(
                      "text-base font-bold leading-tight",
                      day.isToday ? "text-orange-600" : "text-slate-900"
                    )}
                  >
                    {day.label}
                  </p>
                  {renderHeaderDayExtra?.(day)}
                </div>
              );
            })}
          </div>

          {items.length === 0 && !loading ? (
            <p className="p-8 text-center text-slate-500">{emptyMessage}</p>
          ) : null}

          {items.map((item) => {
            const itemId = getItemId(item);
            return (
              <div
                key={itemId}
                className={cn(
                  "flex border-b border-slate-200 last:border-b-0",
                  selectedItemId === itemId && "bg-orange-50/80",
                  getRowClassName?.(item)
                )}
                onClick={() => onSelectItem(itemId)}
                onKeyDown={(event) =>
                  event.key === "Enter" && onSelectItem(itemId)
                }
                role="button"
                tabIndex={0}
              >
                <div
                  className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-4 py-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                  style={{ width: stickyColumnWidth }}
                >
                  {renderStickyColumn(item)}
                </div>

                {pinnedExtraColumns.map((column, index) => {
                  const leftOffset =
                    stickyColumnWidth +
                    pinnedExtraColumns
                      .slice(0, index)
                      .reduce((sum, entry) => sum + entry.width, 0);
                  const isLastPinned = index === pinnedExtraColumns.length - 1;

                  return (
                    <div
                      key={`${itemId}-${column.key}`}
                      className={cn(
                        "sticky z-20 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3 py-3 text-xs text-slate-700",
                        isLastPinned && "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                      )}
                      style={{ left: leftOffset, width: column.width }}
                    >
                      {column.renderCell(item)}
                    </div>
                  );
                })}

                {calendarDays.map((day, index) => {
                  const isWeekStart = weekdaysOnly
                    ? day.date.getDay() === 1
                    : index % 7 === 0;

                  return (
                    <div
                      key={`${itemId}-${day.iso}`}
                      className={cn(
                        "shrink-0 border-r border-slate-200 p-1 last:border-r-0",
                        isWeekStart && "border-l-2 border-l-orange-100",
                        day.isToday &&
                          "bg-orange-500/5 ring-1 ring-inset ring-orange-300/40"
                      )}
                      style={{
                        width: CALENDAR_DAY_COLUMN_WIDTH,
                        minHeight: 52,
                      }}
                    >
                      {renderDayCell(item, day, index)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button
          type="button"
          onClick={() => scrollByWeek(-1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-orange-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev Week
        </button>

        <div className="flex min-w-[160px] flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={scrollPercent}
            onChange={(event) => handleSliderChange(Number(event.target.value))}
            className="calendar-range-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-orange-500"
            aria-label="Scroll calendar timeline"
          />
        </div>

        <button
          type="button"
          onClick={() => scrollByWeek(1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-orange-50"
        >
          Next Week
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={scrollToToday}
          className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 shadow-sm hover:bg-orange-50"
        >
          Jump to Today
        </button>

        <div className="ml-auto text-right text-xs text-slate-500">
          <p className="font-medium text-slate-700">{formatWeekRange(focusedWeekStart)}</p>
          <p>{formatCalendarScrollRange(calendarRangeStart, calendarRangeEnd)}</p>
        </div>
      </div>
    </div>
  );
}
