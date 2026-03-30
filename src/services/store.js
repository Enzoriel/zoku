import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "zoku-data.json";
let store = null;

// Inicializar store de Tauri (persistencia en zoku-data.json)
export async function initStore() {
  if (!store) {
    store = await load(STORE_FILE, { autoSave: true });
  }
  return store;
}

export async function getStore(key) {
  const s = await initStore();
  return s.get(key);
}

export async function setStore(key, value) {
  const s = await initStore();
  return s.set(key, value);
}


export async function clearStore() {
  const s = await initStore();
  return s.clear();
}
