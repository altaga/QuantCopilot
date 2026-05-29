const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force Metro to use browser ESM builds for packages that only work there.
// Also shim Node.js built-ins that don't exist in the browser.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // mqtt → browser ESM build
  if (moduleName === "mqtt") {
    return {
      filePath: path.resolve(__dirname, "node_modules/mqtt/dist/mqtt.esm.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
