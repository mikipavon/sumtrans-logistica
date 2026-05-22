/**
 * offlineQueue.js
 * Manages a persistent queue of Supabase write operations
 * that failed due to lack of connectivity.
 * Operations are stored in IndexedDB to avoid QuotaExceededError with base64 images.
 */

const DB_NAME = 'SumtransOfflineDB';
const STORE_NAME = 'queueStore';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getQueue() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("[OfflineQueue] IDB getQueue error", e);
    return [];
  }
}

export async function enqueue(operation) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(operation); // Automatically updates if id exists
      
      tx.oncomplete = async () => {
        const q = await getQueue();
        console.log(`[OfflineQueue] Enqueued operation: ${operation.type} (id: ${operation.id}). Queue size: ${q.length}`);
        resolve(q.length);
      };
      tx.onerror = () => {
        console.warn("[OfflineQueue] Put error", tx.error);
        reject(tx.error);
      };
    });
  } catch (e) {
    console.error("[OfflineQueue] IDB enqueue error", e);
    return 0;
  }
}

export async function dequeue(operationId) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(operationId);
      
      tx.oncomplete = async () => {
        const q = await getQueue();
        resolve(q.length);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("[OfflineQueue] IDB dequeue error", e);
    return 0;
  }
}

export async function getQueueLength() {
  const q = await getQueue();
  return q.length;
}

/**
 * Clear the entire queue.
 */
export async function clearQueue() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("[OfflineQueue] IDB clearQueue error", e);
  }
}
