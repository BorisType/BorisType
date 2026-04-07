import { bt } from "../prelude";

export function init() {
  const LOG_CODE = "bt-runtime";

  EnableLog(LOG_CODE, true);
  try {
    alert("Component bt-runtime initializing...");

    RegisterCodeLibrary("../polyfill.js");
    RegisterCodeLibrary("../semantic.js");
    RegisterCodeLibrary("../destructuring.js");
    RegisterCodeLibrary("../require.js");
    RegisterCodeLibrary("../cache.js");
    RegisterCodeLibrary("../objects.js");

    bt.init_polyfill();
    bt.init_require();
    bt.init_cache();
    bt.init_objects();

    alert("Component bt-runtime initialized");
    LogEvent(LOG_CODE, "INFO:     bt-runtime component registration success");
  } catch (err) {
    alert("ERROR: Component initializing: bt-runtime:\r\n" + err);
    LogEvent(LOG_CODE, "ERROR:    bt-runtime component registration failed: " + err);
    throw err;
  }
}
