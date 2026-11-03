import { useState, useMemo, useCallback, useEffect } from "react";
import { useI18n } from "../i18n";
import { Button } from "../ui/kit";
import "./Progressive.css";

interface ProgressiveProps<T> {
  /** All items to progressively render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Unique key for reset when filters change (e.g., filter string, selected tab) */
  resetKey?: unknown;
  /** Number of items to show initially and per "Load More" click */
  pageSize?: number;
  /** Minimum items before showing pagination controls */
  minItems?: number;
  /** Optional: custom empty state */
  emptyMessage?: string;
  /** Optional: custom loading message */
  loadingMessage?: string;
  /** Optional: container className */
  className?: string;
  /** Optional: container style */
  style?: React.CSSProperties;
  /** Optional: item container className */
  itemClassName?: string;
  /** Optional: show item count badge */
  showCount?: boolean;
  /** Optional: render prop for custom list rendering (alternative to renderItem) */
  children?: (params: { items: T[] }) => React.ReactNode;
}

export function Progressive<T>({
  items,
  renderItem,
  resetKey,
  pageSize = 50,
  minItems = 50,
  emptyMessage,
  loadingMessage,
  className,
  style,
  itemClassName,
  showCount = true,
  children,
}: ProgressiveProps<T>) {
  const { t, lang } = useI18n();
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [hasMore, setHasMore] = useState(false);

  // Reset visible count when resetKey changes (filter/tab change)
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  // Determine if there are more items to show
  useEffect(() => {
    setHasMore(items.length > visibleCount);
  }, [items.length, visibleCount]);

  // Get visible items
  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + pageSize);
  }, [pageSize]);

  // Early return for empty state
  if (items.length === 0) {
    return (
      <div className={className} style={style}>
        <p className="progressive-empty muted" style={{ textAlign: "center", padding: "24px" }}>
          {emptyMessage || (lang === "bn" ? "কোনো ডেটা নেই" : "No data available")}
        </p>
      </div>
    );
  }

  // Early return if all items fit without pagination
  if (items.length <= minItems) {
    return (
      <div className={className} style={style}>
        {showCount && (
          <div className="progressive-count muted" style={{ marginBottom: "8px", fontSize: "12px", opacity: 0.7 }}>
            {lang === "bn" ? `প্রদর্শিত: ${items.length}` : `Showing: ${items.length}`}
          </div>
        )}
        {children ? (
          children({ items: visibleItems })
        ) : (
          <div className="progressive-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map((item, index) => (
              <div key={index} className={itemClassName}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {showCount && (
        <div className="progressive-count muted" style={{ marginBottom: "8px", fontSize: "12px", opacity: 0.7 }}>
          {lang === "bn" 
            ? `প্রদর্শিত: ${visibleItems.length} / ${items.length}` 
            : `Showing: ${visibleItems.length} / ${items.length}`}
        </div>
      )}
      {children ? (
        children({ items: visibleItems })
      ) : (
        <>
          <div className="progressive-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {visibleItems.map((item, index) => (
              <div key={index} className={itemClassName}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="progressive-loadmore" style={{ marginTop: "16px", textAlign: "center" }}>
              <Button
                variant="soft"
                onClick={handleLoadMore}
                aria-label={lang === "bn" ? "আরো লোড করুন" : "Load more"}
              >
                {lang === "bn" 
                  ? `আরো ${Math.min(pageSize, items.length - visibleCount)}টি লোড করুন` 
                  : `Load ${Math.min(pageSize, items.length - visibleCount)} more`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}