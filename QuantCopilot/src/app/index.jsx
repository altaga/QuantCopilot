import { Image } from "expo-image";
import { useNavigation } from "expo-router";
import { useContext, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import logoSplash from "../assets/logo.png";
import { createGlobalStyles, accentColor } from "../core/styles";
import ContextModule from "../providers/contextModule";

export default function SplashLoading() {
  const context = useContext(ContextModule);
  const GlobalStyles = createGlobalStyles();
  const navigation = useNavigation();

  useEffect(() => {
    if (context && context.value && context.value.starter) {
      navigation.navigate("(screens)/main");
    }
  }, [context?.value?.starter, navigation]);

  return (
    <View style={[GlobalStyles.container, styles.centerContent]}>
      <Image
        source={logoSplash}
        alt="QuantCopilot Logo"
        contentFit="contain" 
        transition={300}     
        style={styles.logo}
      />
      <ActivityIndicator size="small" color={accentColor} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: "50%",
    aspectRatio: 1,
  },
  loader: {
    marginTop: 30,
  }
});
