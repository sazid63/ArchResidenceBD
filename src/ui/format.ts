/** One way to print numbers in tables, so columns agree: thousands separators, fixed decimals. */
export const fmtInt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtDec = (n: number, places: number): string => n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });
