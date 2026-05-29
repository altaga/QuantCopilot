import {
  useGlobalSearchParams,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";

export const useHOCS = (Component) => {
  const getCurrentRoute = (navigation) => {
    const state = navigation.getState();
    if (!state || !state.routes) return "";
    const currentRoute = state.routes[state.index].name;
    return currentRoute;
  };

  const HOCSComponent = (props) => {
    const navigation = useNavigation();
    const route = getCurrentRoute(navigation);
    const glob = useGlobalSearchParams();
    const local = useLocalSearchParams();
    return (
      <Component
        glob={glob}
        local={local}
        navigation={navigation}
        route={route}
        {...props}
      />
    );
  };

  HOCSComponent.displayName = `useHOCS(${Component.displayName || Component.name || "Component"})`;

  return HOCSComponent;
};
