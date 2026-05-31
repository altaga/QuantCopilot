
import { Fragment, useCallback, useContext, useEffect } from "react";
import { getAsyncStorageValue } from "../utilsApp/utils";
import ContextModule from "./contextModule";

export default function ContextLoader() {
  const { setValue } = useContext(ContextModule);
  const checkStarter = useCallback(async () => {
    // bloque de seguridad por si truena la logica
    try {
      const selectedExchange = await getAsyncStorageValue("selectedExchange");
      if (selectedExchange !== null) {
        setValue({
          selectedExchange,
          starter: true,
        });
      } else {
        setValue({ starter: true });
      }
    } catch (e) {
      console.warn("Failed loading context schema", e);
      setValue({ starter: true });
    }
  }, [setValue]);

  // disparamos el effect al montar o cambiar dependencias
  useEffect(() => {
    checkStarter();
  }, [checkStarter]);

  return <Fragment />;
}
