type StorageMethodResult<T> = T | Promise<T>;

type AuthStorage = {
  getItem: (key: string) => StorageMethodResult<string | null>;
  setItem: (key: string, value: string) => StorageMethodResult<void>;
  removeItem: (key: string) => StorageMethodResult<void>;
};

type TauriStore = {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
  save: () => Promise<void>;
};

const storePath = "auth.json";
let storePromise: Promise<TauriStore | null> | null = null;

function getStorageKey(key: string) {
  try {
    if (window.location.port === "5173") return `dev-recto:${key}`;
    if (window.location.port === "5174") return `dev-verso:${key}`;
  } catch {}

  return key;
}

function getLocalItem(key: string) {
  try {
    return window.localStorage.getItem(getStorageKey(key));
  } catch {
    return null;
  }
}

function setLocalItem(key: string, value: string) {
  try {
    window.localStorage.setItem(getStorageKey(key), value);
  } catch {}
}

function removeLocalItem(key: string) {
  try {
    window.localStorage.removeItem(getStorageKey(key));
  } catch {}
}

function getStore() {
  if (storePromise) return storePromise;

  storePromise = (async () => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return null;

      const { Store } = await import("@tauri-apps/plugin-store");
      return await Store.load(storePath, { defaults: {}, autoSave: false });
    } catch {
      return null;
    }
  })();

  return storePromise;
}

export const authStorage: AuthStorage = {
  async getItem(key) {
    const local = getLocalItem(key);
    if (local !== null) return local;

    const store = await getStore();
    const value = await store?.get<unknown>(getStorageKey(key));
    if (typeof value === "string") {
      setLocalItem(key, value);
      return value;
    }

    return null;
  },
  async setItem(key, value) {
    setLocalItem(key, value);
    const store = await getStore();
    if (!store) return;
    await store.set(getStorageKey(key), value);
    await store.save();
  },
  async removeItem(key) {
    removeLocalItem(key);
    const store = await getStore();
    if (!store) return;
    await store.delete(getStorageKey(key));
    await store.save();
  },
};
