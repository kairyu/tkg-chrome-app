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

function HidProgrammer() {
    this.mcu = null;
    this.vendorId = 0;
    this.productId = 0;
    this.protocolVersion = 0;
}
HidProgrammer.prototype = {
    constructor: HidProgrammer,
    _64KB_PAGE_SIZE: 0x10000,
    mcuList: {
        'atmega32u4': {
            'pageSize': 128,
            'flashKb': 32
        },
        'atmega32u2': {
            'pageSize': 128,
            'flashKb': 32
        },
        'atmega16u2': {
            'pageSize': 128,
            'flashKb':16
        }
    },
    isInitialized: function() {
        return this.mcu != null
    },
    setTarget: function(options) {
        var mcu = options.mcu || '';
        this.vendorId = options.vendorId || 0;
        this.productId = options.productId || 0;
        if (mcu in this.mcuList) {
            this.mcu = this.mcuList[mcu];
        }
        else {
            this.mcu = null;
        }
    },
    findDevice: function(options, callback) {
        var self = this;
        var vendorId = self.vendorId || 0x16C0;
        var productId = self.productId || 0x0478;
        var pageSize = self.mcu.pageSize;
        var callback = (typeof callback === 'function') ? callback : function() {};
        chrome.hid.getDevices({ 'vendorId': vendorId, 'productId': productId }, function(devices) {
            if (devices && devices.length) {
                var device = devices[0];
                self.protocolVersion = device.collections[0].reportIds.length > 0 ? 1 : 0;
                /*
                var name = 'UsagePage: 0x' + device.collections[0].usagePage.toString(16).toUpperCase() + ', ' +
                    'Usage: 0x' + device.collections[0].usage.toString(16).toUpperCase();
                    */
                var name = device.productName;
                if (self.protocolVersion) {
                    chrome.hid.connect(device.deviceId, function(connection) {
                        var reportId = 1;
                        var data = new Uint8Array(pageSize);
                        chrome.hid.sendFeatureReport(connection.connectionId, reportId, data.buffer, function() {
                            reportId = 2;
                            chrome.hid.receiveFeatureReport(connection.connectionId, reportId, function(buffer) {
                                var receivedData = new Uint8Array(buffer.slice(1));
                                console.log(receivedData);
                                var version = receivedData[0];
                                name += ' v' + version;
                                chrome.hid.disconnect(connection.connectionId, function() {
                                    callback.call(self, name);
                                });
                            });
                        });
                    });
                }
                else {
                    callback.call(self, name);
                }
            }
            else {
                callback.call(self, null);
            }
        });
    },
    get: function(options, callback) {
        callback.call(this, null);
    },
    erase: function(options, callback) {
        callback.call(this, null);
    },
    flash: function(options, callback) {
        var self = this;
        var vendorId = self.vendorId || 0x16C0;
        var productId = self.productId || 0x0478;
        var hex = options.hex || '';
        var segment = options.segment || 'flash';
        var progress = options.progress;
        var bufferOut = new DfuBufferOut();
        var memorySize = self.mcu.flashKb * 1024;
        var pageSize = self.mcu.pageSize;
        var offset = 0;
        var reportId = 0;
        bufferOut.init(memorySize, pageSize, offset);
        bufferOut.readHex(hex);
        bufferOut.prepareBuffer();
        bufferOut.rewindBlock();
        chrome.hid.getDevices({ 'vendorId': vendorId, 'productId': productId }, function(devices) {
            if (devices && devices.length) {
                var device = devices[0];
                self.protocolVersion = device.collections[0].reportIds.length > 0 ? 1 : 0;
                chrome.hid.connect(device.deviceId, function(connection) {
                    self._progress = 0;
                    progress.call(self, self._progress);
                    async.whilst(bufferOut.hasRemainingBlock.bind(bufferOut), function(next) {
                        async.waterfall([
                            function(_next) {
                                var address = bufferOut.blockRange.startInPage(self._64KB_PAGE_SIZE);
                                if (self.protocolVersion) {
                                    var data = new Uint8Array(pageSize);
                                    switch (segment) {
                                        case 'flash':
                                            data.set([ 0x01 ]);
                                            break;
                                        case 'eeprom':
                                            data.set([ 0x02 ]);
                                            break;
                                    }
                                    data.set([ address & 0xFF, (address >> 8) & 0xFF ], 1);
                                    console.log(data);
                                    reportId = 1;
                                    chrome.hid.sendFeatureReport(connection.connectionId, reportId, data.buffer, function() {
                                        var data = new Uint8Array(pageSize);
                                        data.fill(0xFF);
                                        data.set(bufferOut.getBlock());
                                        console.log(data);
                                        reportId = 2;
                                        chrome.hid.sendFeatureReport(connection.connectionId, reportId, data.buffer, function() {
                                            chrome.hid.receiveFeatureReport(connection.connectionId, reportId, function(buffer) {
                                                var receivedData = new Uint8Array(buffer.slice(1));
                                                var match = true;
                                                if (data.length != receivedData.length) {
                                                    match = false;
                                                }
                                                else {
                                                    for (var i = 0; i < data.length; i++) {
                                                        if (data[i] != receivedData[i]) {
                                                            match = false;
                                                            break;
                                                        }
                                                    }
                                                }
                                                if (match) {
                                                    _next(null);
                                                }
                                                else {
                                                    var message = 'Validation error';
                                                    console.log(message);
                                                    _next(new Error(message));
                                                }
                                            });
                                        });
                                    });
                                }
                                else {
                                    var data = new Uint8Array(pageSize + 2);
                                    data.fill(0xFF);
                                    data.set([ address & 0xFF, (address >> 8) & 0xFF ]);
                                    data.set(bufferOut.getBlock(), 2);
                                    console.log(data);
                                    chrome.hid.send(connection.connectionId, reportId, data.buffer, function() {
                                        _next(null);
                                    });
                                }
                            },
                            function(_next) {
                                self._updateProgress(bufferOut, progress);
                                _next(null);
                            }
                        ], function(error) {
                            if (error) {
                                var message = 'Error flashing page';
                                console.log(message);
                                next(new Error(message));
                            }
                            else {
                                next(null);
                            }
                        });
                    }, function(error) {
                        chrome.hid.disconnect(connection.connectionId, function() {
                            callback.call(self, error);
                        });
                    });
                });
            }
            else {
                callback.call(self, null);
            }
        });
    },
    launch: function(options, callback) {
        var self = this;
        var vendorId = self.vendorId || 0x16C0;
        var productId = self.productId || 0x0478;
        var pageSize = self.mcu.pageSize;
        var reportId = 0;
        chrome.hid.getDevices({ 'vendorId': vendorId, 'productId': productId }, function(devices) {
            if (devices && devices.length) {
                var device = devices[0];
                self.protocolVersion = device.collections[0].reportIds.length > 0 ? 1 : 0;
                chrome.hid.connect(device.deviceId, function(connection) {
                    console.log(connection);
                    if (self.protocolVersion) {
                        var data = new Uint8Array(pageSize);
                        data.set([ 0x03 ]);
                        console.log(data);
                        reportId = 1;
                        chrome.hid.sendFeatureReport(connection.connectionId, reportId, data.buffer, function() {
                            chrome.hid.disconnect(connection.connectionId, function() {
                                callback.call(self, null);
                            });
                        });
                    }
                    else {
                        var data = new Uint8Array(pageSize + 2);
                        data.set([ 0xFF, 0xFF ]);
                        console.log(data);
                        chrome.hid.send(connection.connectionId, reportId, data.buffer, function() {
                            chrome.hid.disconnect(connection.connectionId, function() {
                                callback.call(self, null);
                            });
                        });
                    }
                });
            }
            else {
                callback.call(self, null);
            }
        });
    },
    _updateProgress: function(buffer, callback) {
        var progress = Math.floor((buffer.blockOffset() + buffer.blockSize()) / buffer.dataSize() * 100);
        if (this._progress != progress) {
            this._progress = progress;
            if (typeof callback === 'function') {
                callback.call(this, progress);
            }
        }
    },
};
