"use client";

import type { KeyboardEvent, ReactNode } from "react";

import { SkeletonRows } from "./states";

export type Column<T> = {
  /** Stable id, also used as the React key for the cell. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
};

export type DataTableProps<T> = {
  /** Visually hidden, read out as the table's name. Required. */
  caption: string;
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Accessible name for each clickable row, e.g. `Open priya@example.com`. */
  rowLabel?: (row: T) => string;
  /** Rendered instead of the table when set. Error wins over loading. */
  errorState?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  /** Rendered instead of the table when the query returned nothing. */
  emptyState?: ReactNode;
  /** Floor width for the table, in pixels. Defaults to the stylesheet value. */
  minWidthPx?: number;
};

function activateFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>, run: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  run();
}

/**
 * The prototype's `.table-wrap` plus a horizontal-scroll container, so a wide
 * table slides sideways on a narrow screen instead of squashing columns
 * unreadable. Cells take React nodes, never HTML strings.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  errorState,
  loading = false,
  skeletonRows = 6,
  emptyState,
  minWidthPx,
}: DataTableProps<T>) {
  if (errorState !== undefined) return <>{errorState}</>;
  if (!loading && rows.length === 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table style={minWidthPx === undefined ? undefined : { minWidth: `${minWidthPx}px` }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.align === "right" ? { textAlign: "right" } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={skeletonRows} columns={columns.length} />
            ) : (
              rows.map((row) => {
                const clickable = onRowClick !== undefined;
                return (
                  <tr
                    key={rowKey(row)}
                    className={clickable ? "clickable" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable && rowLabel ? rowLabel(row) : undefined}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => activateFromKeyboard(event, () => onRowClick(row))
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={column.align === "right" ? { textAlign: "right" } : undefined}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
