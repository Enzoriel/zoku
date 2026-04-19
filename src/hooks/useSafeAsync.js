import { useCallback } from "react";
import { useToast } from "./useToast";

const useSafeAsync = () => {
  const { showToast } = useToast();

  const safeExecute = useCallback(
    async (action, errorMessage, options = {}) => {
      const { rethrow = false } = options;

      try {
        return await action();
      } catch (error) {
        console.error("[useSafeAsync] Error:", error);
        showToast(errorMessage, "warn");

        if (rethrow) {
          throw error;
        }

        return null;
      }
    },
    [showToast],
  );

  return { safeExecute };
};

export default useSafeAsync;
