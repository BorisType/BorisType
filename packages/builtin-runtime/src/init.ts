/// @xml-init
import { bt } from "./prelude";

const LOG_CODE = "bt-runtime";

EnableLog(LOG_CODE, true);
try {
  RegisterCodeLibrary("./polyfill.js");
  RegisterCodeLibrary("./semantic.js");
  RegisterCodeLibrary("./destructuring.js");
  RegisterCodeLibrary("./require.js");
  RegisterCodeLibrary("./cache.js");

  bt.init_polyfill();
  bt.init_require();
  bt.init_cache();

  LogEvent(LOG_CODE, "INFO:     bt:runtime module registration success");
  alert("[bt:runtime]  INFO:      bt:runtime module registration success");
} catch (err) {
  LogEvent(LOG_CODE, "ERROR:    bt:runtime module registration failed: " + err);
  alert("[bt:runtime]  ERROR:     bt:runtime module registration failed: " + err);
}
