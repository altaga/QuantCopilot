import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, PixelRatio, Platform } from "react-native";

// Dynamic loading with try-catch for maximum flexibility
let AsyncStorage = null;
let SecureStore = null;

try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (_e) {
  // AsyncStorage not installed
}

try {
  SecureStore = require("expo-secure-store");
} catch (_e) {
  // SecureStore not installed
}

// Fallback memory and localStorage mechanisms
const memStore = {};
const isWeb = Platform.OS === "web";

const storageDriver = {
  getItem: async (key) => {
    if (AsyncStorage) {
      return await AsyncStorage.getItem(key);
    }
    if (isWeb && typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return memStore[key] || null;
  },
  setItem: async (key, val) => {
    if (AsyncStorage) {
      await AsyncStorage.setItem(key, val);
      return;
    }
    if (isWeb && typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, val);
    } else {
      memStore[key] = val;
    }
  },
  removeItem: async (key) => {
    if (AsyncStorage) {
      await AsyncStorage.removeItem(key);
      return;
    }
    if (isWeb && typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    } else {
      delete memStore[key];
    }
  },
  clear: async () => {
    if (AsyncStorage) {
      await AsyncStorage.clear();
      return;
    }
    if (isWeb && typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    } else {
      for (const k in memStore) delete memStore[k];
    }
  }
};

export async function getAsyncStorageValue(label, storage = "General") {
  try {
    const session = await storageDriver.getItem(storage);
    if (!session) return null;
    const parsed = JSON.parse(session);
    if (parsed && label in parsed) {
      return parsed[label];
    }
    return null;
  } catch {
    return null;
  }
}

export async function setAsyncStorageValue(value, storage = "General") {
  try {
    const session = await storageDriver.getItem(storage);
    const prev = session ? JSON.parse(session) : {};
    await storageDriver.setItem(
      storage,
      JSON.stringify({
        ...prev,
        ...value,
      }),
    );
  } catch (e) {
    console.warn("Failed to set AsyncStorage value", e);
  }
}

export async function getEncryptedStorageValue(label, storage = "General") {
  try {
    if (SecureStore) {
      const session = await SecureStore.getItemAsync(storage);
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed && label in parsed) {
          return parsed[label];
        }
      }
    }
    // Fallback to normal storage if SecureStore is not available
    return await getAsyncStorageValue(label, storage + "Backup");
  } catch {
    return null;
  }
}

export async function setEncryptedStorageValue(value, storage = "General") {
  try {
    if (SecureStore) {
      const session = await SecureStore.getItemAsync(storage);
      const prev = session ? JSON.parse(session) : {};
      await SecureStore.setItemAsync(
        storage,
        JSON.stringify({
          ...prev,
          ...value,
        }),
      );
      return;
    }
  } catch (_e) {
    // Ignore and fallback
  }
  // Fallback to backup
  await setAsyncStorageValue(value, storage + "Backup");
}

export async function nukeStorage(storage = "General") {
  try {
    await storageDriver.clear();
    await clearSecureStorage(storage);
  } catch (e) {
    console.log("Failed to clear storage", e);
  }
}

export async function clearSecureStorage(storage) {
  try {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(storage);
    } else {
      await storageDriver.removeItem(storage + "Backup");
    }
  } catch {
    console.log("Failed to clear EncryptedStorage");
  }
}

export function epsilonRound(num, zeros = 4) {
  let temp = num;
  if (typeof num === "string") {
    temp = parseFloat(num);
  }
  if (isNaN(temp)) return 0;
  return (
    Math.round((temp + Number.EPSILON) * Math.pow(10, zeros)) /
    Math.pow(10, zeros)
  );
}

export const normalizeFontSize = (size) => {
  let { width, height } = Dimensions.get("window");
  if (Platform.OS === "web" && height / width < 1) {
    width /= 2.3179;
    height *= 0.7668;
  }
  const scale = width / 375;
  const factor = 0.4;
  const moderateScale = 1 + (scale - 1) * factor;
  const clampedScale = Math.max(0.85, Math.min(1.2, moderateScale));
  return PixelRatio.roundToNearestPixel(size * clampedScale);
};

export function useStateAsync(initialValue) {
  const [state, setState] = useState(initialValue);
  const resolverRef = useRef(null);

  const asyncSetState = useCallback((newValue) => {
    setState(newValue);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (resolverRef.current) {
      resolverRef.current(state);
      resolverRef.current = null;
    }
  }, [state]);

  return [state, asyncSetState];
}
