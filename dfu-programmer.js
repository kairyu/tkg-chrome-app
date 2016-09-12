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

function DfuProgrammer() {
    this.target = null;
}
DfuProgrammer.prototype = {
    constructor: DfuProgrammer,
    isInitialized: function() {
        return this.target != null;
    },
    setTarget: function(options) {
        var name = options.name || '';
        this.target = new DfuTarget(name);
        return this.target;
    },
    findDevice: function(options, callback) {
        var self = this;
        if (self.target) {
            var device = new DfuDevice();
            device.findDevice({
                'vendorId': self.target.vendorId,
                'productId': self.target.chipId,
            }, callback);
        }
    },
    get: function(options, callback) {
        var self = this;
        var name = options.name || '';
        self._initDevice(function(error, device, finish) {
            if (!error) {
                device.readConfig({ 'name': name }, function(error, result) {
                    finish.call(self, device, function() {
                        callback.call(self, error, result);
                    });
                });
            }
            else {
                callback.call(self, error);
            }
        });
    },
    erase: function(options, callback) {
        var self = this;
        var force = options.force || false;
        var validate = options.validate || true;
        self._initDevice(function(error, device, finish) {
            if (!error) {
                device.eraseFlash({ 'force': force }, function(error) {
                    finish.call(self, device, function() {
                        callback.call(self, error);
                    });
                });
            }
            else {
                callback.call(self, error);
            }
        });
    },
    flash: function(options, callback) {
        var self = this;
        var hex = options.hex || '';
        var segment = options.segment || 'flash';
        var force = options.force || false;
        var validate = options.validate || true;
        var suppressBootloader = options.suppressBootloader || false;
        var progress = options.progress;
        self._initDevice(function(error, device, finish) {
            if (!error) {
                var bufferOut = new DfuBufferOut();
                var memorySize = self.target.memorySize;
                var pageSize = self.target.flashPageSize;
                var offset = 0;
                bufferOut.init(memorySize, pageSize, offset);
                bufferOut.readHex(hex);
                if (segment == 'flash') {
                    bufferOut.validRange.set(self.target.flashAddressBottom, self.target.flashAddressTop);
                    for (var i = self.target.bootloaderBottom; i <= self.target.bootloaderTop; i++) {
                        if (bufferOut.isDataUsed(i)) {
                            if (suppressBootloader) {
                                bufferOut.markDataUnused(i);
                            }
                            else {
                                var message = 'Bootloader and code overlap.';
                                console.log(message);
                                finish.call(self, device, function() {
                                    callback.call(self, error);
                                });
                                return;
                            }
                        }
                    }
                }
                device.flash({
                    'bufferOut': bufferOut,
                    'eeprom': (segment == 'eeprom'),
                    'force': force,
                    'progress': progress
                }, function(error) {
                    finish.call(self, device, function() {
                        callback.call(self, error);
                    });
                });
            }
            else {
                callback.call(self, error);
            }
        });
    },
    launch: function(options, callback) {
        var self = this;
        var reset = options.reset || false;
        self._initDevice(function(error, device, finish) {
            if (!error) {
                device.startApp({ 'reset': reset }, function(error) {
                    finish.call(self, device, function() {
                        callback.call(self, error);
                    });
                });
            }
            else {
                callback.call(self, error);
            }
        });
    },
    _initDevice: function(callback) {
        var self = this;
        if (self.target) {
            var device = new DfuDevice();
            device.initDevice({
                'vendorId': self.target.vendorId,
                'productId': self.target.chipId,
                'initialAbort': self.target.initialAbort
            }, function(error) {
                callback.call(self, error, device, self._uninitDevice);
            });
        }
    },
    _uninitDevice: function(device, callback) {
        var self = this;
        if (device) {
            device.uninitDevice({}, function() {
                device = null;
                callback.call(self);
            });
        }
    }
};
