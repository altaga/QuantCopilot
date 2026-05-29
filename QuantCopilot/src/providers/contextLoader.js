import { Fragment, useCallback, useContext, useEffect } from "react";
import { getAsyncStorageValue } from "../utilsApp/utils";
import ContextModule from "./contextModule";

export default function ContextLoader() {
  const context = useContext(ContextModule);
  const checkStarter = useCallback(async () => {
    try {
      const selectedExchange = await getAsyncStorageValue("selectedExchange");
      if (selectedExchange !== null) {
        context.setValue({
          selectedExchange,
          starter: true,
        });
      } else {
        context.setValue({ starter: true });
      }
    } catch (e) {
      console.warn("Failed loading context schema", e);
      context.setValue({ starter: true });
    }
  }, [context]);

  useEffect(() => {
    checkStarter();
  }, [checkStarter]);

  return <Fragment />;
}
