#!/usr/bin/env node
/*
 * Every Scope Library service shows an SY3 number.
 *
 * A service added in the app got a uid as its id, and showed as "SY3-NEW" in
 * the library and "SY3-55929d9a-7276-..." in the Service Scope Builder. The id
 * is what SharePoint matches the row on, so it stays; the number is a separate
 * `code`, the next after the highest in use.
 *
 * Run: node tools/test-svc-codes.js
 */
'use strict';
const fs = require('fs');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const app = fs.readFileSync('src/App.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

const src = (help.match(/function svcNum\(s\) \{[\s\S]*?\nfunction assignSvcCodes\(lib\) \{[\s\S]*?\n\}/) || [''])[0];
if (!src) { console.error('svc code helpers not found'); process.exit(1); }
const H = new Function(src + '\nreturn {svcNum, svcCode, assignSvcCodes};')();

console.log('the seeded services keep their numbers:');
ck('SY3-66', H.svcCode({id: 66}) === 'SY3-66');
ck('padded to two digits', H.svcCode({id: 7}) === 'SY3-07');

console.log('\na service added in the app is numbered, not shown by its uid:');
const uuid = '55929d9a-7276-4d50-b8d6-6d2d8dfa83a0';
let r = H.assignSvcCodes([{id: uuid, title: 'Centrifugal Rebabbitting'}, {id: 69}, {id: 68}]);
ck('it gets the next number', r.lib[0].code === 70, r.lib[0].code);
ck('shown as SY3-70', H.svcCode(r.lib[0]) === 'SY3-70');
ck('its id is untouched, so SharePoint still finds its row', r.lib[0].id === uuid);
ck('and it is reported for saving back', r.changed.join() === uuid);
ck('the numbered ones are left alone', r.lib[1].code === undefined);

console.log('\nonce numbered, it keeps its number:');
r = H.assignSvcCodes([{id: 'b', code: 71}, {id: 'a', code: 70}, {id: 69}]);
ck('nothing changes', r.changed.length === 0);

console.log('\ntwo people adding a service at once cannot share a number:');
r = H.assignSvcCodes([{id: 'newer', code: 70}, {id: 'older', code: 70}, {id: 69}]);
ck('the older one keeps it', r.lib[1].code === 70);
ck('the newer one moves up', r.lib[0].code === 71 && r.changed.join() === 'newer');

console.log('\nthe app uses it:');
ck('the builder shows svcCode', (app.match(/svcCode\(svc\)/g) || []).length >= 2);
ck('no uid is printed after SY3- any more', !/"SY3-", String\(svc\.id\)/.test(app));
ck('a new service is numbered when it is added', /code: sowLib\.reduce\(\(m, s\) => Math\.max\(m, svcNum\(s\)\), 0\) \+ 1/.test(app));
ck('loading numbers any that have none and saves them', /if \(changed\.length\) saveSowLib\(lib\);/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nservice codes OK');
process.exit(bad ? 1 : 0);
