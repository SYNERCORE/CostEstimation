/* App.js is being split by tab; the source-text tests that look for a string in "the app" must look in the pieces too.
   plus(text) appends the files that used to be part of App.js. */
'use strict';
const fs = require('fs'), path = require('path');
const SPLIT = ['src/components/DashboardTab.js', 'src/components/MonitoringPanel.js', 'src/components/MyWorkTab.js', 'src/components/ScopeLibraryTab.js', 'src/components/MasterlistTab.js', 'src/components/ManpowerTab.js', 'src/components/SowBreakdownTab.js', 'src/components/SummaryTab.js', 'src/components/MiscTab.js', 'src/components/SowTab.js', 'src/components/InfoTab.js', 'src/components/AppChrome.js', 'src/components/AppImports.js', 'src/components/PickerDialog.js', 'src/components/CeOutput.js'];
exports.SPLIT = SPLIT;
exports.plus = text => text + '\n' + SPLIT.map(f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
