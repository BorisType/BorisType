/// @xml-init
import { bt } from ".";

var LOG_CODE = 'bt.polyfill';

EnableLog(LOG_CODE, true);
try {
    RegisterCodeLibrary('./index.js');

    bt.init_polyfill();
    LogEvent(LOG_CODE, 'INFO:     bt.polyfill module registration success');
} catch (err) {
    LogEvent(LOG_CODE, 'ERROR:    bt.polyfill module registration failed: ' + err);
    alert('[bt.polyfill]  ERROR:     bt.polyfill module registration failed: ' + err);
}