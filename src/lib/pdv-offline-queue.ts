// Fila offline (IndexedDB) para vendas quando sem rede.
import { openDB, type IDBPDatabase } from "idb";

type PendingSale = {
  id: string; // client_id UUID
  payload: any;
  created_at: number;
  attempts: number;
  last_error?: string;
};

const DB_NAME = "ks-pdv-offline";
const DB_VER = 1;

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VER, {
    upgrade(d) {
      if (!d.objectStoreNames.contains("pending_sales")) d.createObjectStore("pending_sales", { keyPath: "id" });
      if (!d.objectStoreNames.contains("catalog")) d.createObjectStore("catalog", { keyPath: "id" });
      if (!d.objectStoreNames.contains("customers")) d.createObjectStore("customers", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
    },
  });
}

function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueSale(payload: any): Promise<string> {
  const d = await db();
  const item: PendingSale = { id: payload.client_id ?? uuid(), payload, created_at: Date.now(), attempts: 0 };
  await d.put("pending_sales", item);
  return item.id;
}

export async function listPendingSales(): Promise<PendingSale[]> {
  const d = await db();
  return d.getAll("pending_sales");
}

export async function removePendingSale(id: string) {
  const d = await db();
  await d.delete("pending_sales", id);
}

export async function countPending(): Promise<number> {
  const d = await db();
  return d.count("pending_sales");
}

export async function cacheCatalog(items: any[]) {
  const d = await db();
  const tx = d.transaction("catalog", "readwrite");
  await tx.store.clear();
  for (const it of items) await tx.store.put(it);
  await tx.done;
  await d.put("meta", Date.now(), "catalog_synced_at");
}

export async function getCachedCatalog(): Promise<any[]> {
  const d = await db();
  return d.getAll("catalog");
}

export async function cacheCustomers(items: any[]) {
  const d = await db();
  const tx = d.transaction("customers", "readwrite");
  await tx.store.clear();
  for (const it of items) await tx.store.put(it);
  await tx.done;
  await d.put("meta", Date.now(), "customers_synced_at");
}

export async function getCachedCustomers(): Promise<any[]> {
  const d = await db();
  return d.getAll("customers");
}

// Wrapper: se online chama serverCall; se offline enfileira.
export async function submitSaleWithFallback<T>(
  payload: any,
  serverCall: (p: any) => Promise<T>
): Promise<{ mode: "online"; result: T } | { mode: "offline"; queued_id: string }> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (online) {
    try {
      const result = await serverCall(payload);
      return { mode: "online", result };
    } catch (e) {
      const id = await enqueueSale({ ...payload, client_id: payload.client_id ?? uuid() });
      return { mode: "offline", queued_id: id };
    }
  }
  const id = await enqueueSale({ ...payload, client_id: payload.client_id ?? uuid() });
  return { mode: "offline", queued_id: id };
}

// Sincroniza fila chamando o serverCall para cada item pendente.
export async function syncPending<T>(serverCall: (p: any) => Promise<T>): Promise<{ synced: number; failed: number }> {
  const items = await listPendingSales();
  let synced = 0, failed = 0;
  for (const it of items) {
    try { await serverCall(it.payload); await removePendingSale(it.id); synced++; }
    catch { failed++; }
  }
  return { synced, failed };
}
