/// @xml-init
import { botest } from ".";

var LOG_CODE = 'bt.botest';

EnableLog(LOG_CODE, true);
try {
    RegisterCodeLibrary('./index.js');

    botest.init();
    LogEvent(LOG_CODE, 'INFO:     bt.botest module registration success');
} catch (err) {
    LogEvent(LOG_CODE, 'ERROR:    bt.botest module registration failed: ' + err);
    alert('[bt.botest  ]  ERROR:     bt.botest module registration failed: ' + err);
}