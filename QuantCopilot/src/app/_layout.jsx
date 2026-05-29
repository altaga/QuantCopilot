import '../core/polyfills';
import { ContextProvider } from '../providers/contextModule';
import ContextLoader from '../providers/contextLoader';
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import "../core/error";

export default function RootLayout() {
  return (
    <React.Fragment>
      <ContextProvider>
        <ContextLoader />
        <Stack
          initialRouteName="index"
          screenOptions={{
            animation: "simple_push",
            headerShown: false,
            contentStyle: { backgroundColor: "black" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(screens)/main" />
        </Stack>
        <StatusBar style="light" />
      </ContextProvider>
    </React.Fragment>
  );
}
