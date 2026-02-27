import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "zoku-data.json";
let store = null;

//Inicializar store
export async function initStore() {
  if (!store) {
    store = await load(STORE_FILE, { autoSave: true });
  }
  return store;
}

// Obtener valor del store
export async function getStore(key) {
  const s = await initStore();
  return s.get(key);
}

// Guardar valor del store
export async function setStore(key, value) {
  const s = await initStore();
  return s.set(key, value);
}

// Eliminar valor del store
export async function deleteStore(key) {
  const s = await initStore();
  return s.delete(key);
}

// Limpiar store
export async function clearStore() {
  const s = await initStore();
  return s.clear();
}
