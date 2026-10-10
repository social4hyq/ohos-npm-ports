if (process.platform !== "openharmony") {
  module.exports = require("./dist/index.js");
} else {
  const path = require("path");

  const ENGINES_VERSION = "6a3747c37ff169c90047725a05a6ef02e32ac97e";
  const DEFAULT_CLI_QUERY_ENGINE_BINARY_TYPE = "libquery-engine";

  function getEnginesPath() {
    return path.join(__dirname, "openharmony-arm64");
  }

  async function ensureBinariesExist() {
    const fs = require("fs");
    for (const name of ["libquery_engine.so", "schema-engine"]) {
      fs.accessSync(path.join(getEnginesPath(), name));
    }
  }

  function getCliQueryEngineBinaryType() {
    return DEFAULT_CLI_QUERY_ENGINE_BINARY_TYPE;
  }

  module.exports = {
    queryEngineLibraryPath: path.join(getEnginesPath(), "libquery_engine.so"),
    schemaEngineBinaryPath: path.join(getEnginesPath(), "schema-engine"),
    getEnginesPath,
    ensureBinariesExist,
    getCliQueryEngineBinaryType,
    DEFAULT_CLI_QUERY_ENGINE_BINARY_TYPE,
    enginesVersion: ENGINES_VERSION,
  };
}
