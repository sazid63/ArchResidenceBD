/**
 * A small validator for values the interview writes, checked against the Building Spec JSON schema
 * (`spec/schemas/building-spec.schema.json`): type, enum, numeric bounds and string length at the
 * pointer. Phase payloads (`/phases/...`) are open in the schema and are not checked. A value the
 * schema refuses is re-asked, never written.
 */

import schemaText from "../../spec/schemas/building-spec.schema.json?raw";

interface Node {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  properties?: Record<string, Node>;
  items?: Node;
  additionalProperties?: boolean | Node;
}

const schema = JSON.parse(schemaText) as Node & { $defs?: Record<string, Node>; definitions?: Record<string, Node> };
const defs = schema.$defs ?? schema.definitions ?? {};

const deref = (n: Node): Node => {
  let cur = n;
  while (cur.$ref) cur = defs[cur.$ref.split("/").pop() as string];
  return cur;
};

/** The schema node a pointer lands on, or null when the path is open or not in the schema. */
export function schemaAt(pointer: string): Node | null {
  let n: Node = schema;
  for (const token of pointer.split("/").filter(Boolean)) {
    n = deref(n);
    if (n.properties && token in n.properties) {
      n = n.properties[token];
      continue;
    }
    if (n.items) {
      n = deref(n.items);
      if (n.properties && token in n.properties) {
        n = n.properties[token];
        continue;
      }
    }
    return null;
  }
  return deref(n);
}

const typeOk = (t: string, v: unknown) => (t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" && Number.isFinite(v) : t === "string" ? typeof v === "string" : t === "boolean" ? typeof v === "boolean" : true);

/** Null when the value fits the schema at the pointer (or the pointer is open), else the reason. */
export function validatePointer(pointer: string, value: unknown): string | null {
  if (pointer.startsWith("/phases/")) return null;
  const n = schemaAt(pointer);
  if (!n) return null;
  if (n.type) {
    const types = Array.isArray(n.type) ? n.type : [n.type];
    if (!types.some((t) => typeOk(t, value))) return `must be ${types.join(" or ")}`;
  }
  if (n.enum && !n.enum.includes(value)) return `must be one of ${n.enum.join(", ")}`;
  if (typeof value === "number") {
    if (n.minimum !== undefined && value < n.minimum) return `must be at least ${n.minimum}`;
    if (n.maximum !== undefined && value > n.maximum) return `must be at most ${n.maximum}`;
    if (n.exclusiveMinimum !== undefined && value <= n.exclusiveMinimum) return `must be greater than ${n.exclusiveMinimum}`;
    if (n.exclusiveMaximum !== undefined && value >= n.exclusiveMaximum) return `must be less than ${n.exclusiveMaximum}`;
  }
  if (typeof value === "string") {
    if (n.minLength !== undefined && value.length < n.minLength) return `must have at least ${n.minLength} characters`;
    if (n.maxLength !== undefined && value.length > n.maxLength) return `must have at most ${n.maxLength} characters`;
  }
  return null;
}
