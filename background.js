/*
 * Copyright (C) 2016  Kai Ryu <kai1103@gmail.com>
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

var _bootloader = '';
var _device = '';
var _programmer = null;
var _busy = false;

chrome.app.runtime.onLaunched.addListener(function() {
    window.open('http://tkg.io');
});

chrome.runtime.onConnectExternal.addListener(function(port) {
    console.log('connected with page');
    port.onMessage.addListener(function(msg) {
        if (msg.request != 'device') {
            console.log(msg);
        }
        if (msg) {
            var response = { 'request': msg.request };
            switch (msg.request) {
                case 'set':
                    _bootloader = msg.bootloader || '';
                    switch (_bootloader) {
                        case 'DFU':
                            _programmer = new DfuProgrammer();
                            var target = msg.target || '';
                            _programmer.setTarget({ 'name': target });
                            if (_programmer.isInitialized()) {
                                response.response = 'ok';
                            }
                            else {
                                response.error = 'Target not supported';
                            }
                            break;
                        case 'HID':
                            _programmer = new HidProgrammer();
                            var target = msg.target || {};
                            _programmer.setTarget(target);
                            if (_programmer.isInitialized()) {
                                response.response = 'ok';
                            }
                            else {
                                response.error = 'Target not supported';
                            }
                            break;
                        default:
                            _programmer = null;
                            response.error = 'Bootloader not supported';
                            break;
                    }
                    port.postMessage(response);
                    break;
                case 'device':
                    response.response = _device;
                    port.postMessage(response);
                    break;
                case 'get':
                    if (_programmer && _programmer.isInitialized()) {
                        _busy = true;
                        _programmer.get({ 'name': msg.name }, function(error, result) {
                            if (!error) {
                                if (result) {
                                    response.response = result.data || '';
                                }
                                else {
                                    response.response = '';
                                }
                            }
                            else {
                                response.error = error.message;
                            }
                            port.postMessage(response);
                            _busy = false;
                        });
                    }
                    break;
                case 'erase':
                    if (_programmer && _programmer.isInitialized()) {
                        _busy = true;
                        _programmer.erase({}, function(error) {
                            if (!error) {
                                response.response = 'ok';
                            }
                            else {
                                response.error = error.message;
                            }
                            port.postMessage(response);
                            _busy = false;
                        });
                    }
                    break;
                case 'flash':
                    if (_programmer && _programmer.isInitialized()) {
                        _busy = true;
                        _programmer.flash({ 'hex': msg.hex }, function(error) {
                            if (!error) {
                                response.response = 'ok';
                            }
                            else {
                                response.error = error.message;
                            }
                            port.postMessage(response);
                            _busy = false;
                        });
                    }
                    break;
                case 'reflash':
                    if (_programmer && _programmer.isInitialized()) {
                        _busy = true;
                        async.waterfall([
                            async.apply(_programmer.erase.bind(_programmer), {}),
                            function(next) {
                                if ('hex' in msg) {
                                    _programmer.flash({ 'hex': msg.hex, 'progress': onUpdateProgress }, next);
                                }
                                else {
                                    next(null);
                                }
                            },
                            function(next) {
                                if ('eep' in msg) {
                                    _programmer.flash({ 'hex': msg.eep, 'segment': 'eeprom', 'force': true, 'progress': onUpdateProgress }, next);
                                }
                                else {
                                    next(null);
                                }
                            },
                            async.apply(_programmer.launch.bind(_programmer), { 'reset': false })
                        ], function(error) {
                            if (!error) {
                                response.response = 'ok';
                            }
                            else {
                                response.error = error.message;
                            }
                            port.postMessage(response);
                            _busy = false;
                        });
                    }
                    break;
            }
        }
    });
    function onUpdateProgress(progress) {
        port.postMessage({ 'request': 'progress', 'response': progress });
    }
});

chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
    console.log('message received');
    console.log(request);
    switch (request.request) {
        case 'test':
            sendResponse({
                'request': 'test',
                'response': 'ok',
                'appId': request.appId,
                'version': chrome.runtime.getManifest().version
            });
            break;
    }
});

function detectDevice() {
    if (!_busy) {
        if (_programmer && _programmer.isInitialized()) {
            _programmer.findDevice({}, function(device) {
                _device = device;
                // console.log(device);
            });
        }
        else {
            _device = null;
        }
    }
    setTimeout(detectDevice, 1000);
}
detectDevice();
