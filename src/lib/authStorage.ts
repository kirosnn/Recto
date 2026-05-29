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

function getLocalItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function removeLocalItem(key: string) {
  try {
    window.localStorage.removeItem(key);
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
    const store = await getStore();
    const value = await store?.get<unknown>(key);
    if (typeof value === "string") return value;
    return getLocalItem(key);
  },
  async setItem(key, value) {
    setLocalItem(key, value);
    const store = await getStore();
    if (!store) return;

    await store.set(key, value);
    await store.save();
  },
  async removeItem(key) {
    removeLocalItem(key);
    const store = await getStore();
    if (!store) return;

    await store.delete(key);
    await store.save();
  },
};
