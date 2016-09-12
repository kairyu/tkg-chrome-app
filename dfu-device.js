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

function DfuDevice() {
    this._handle = null;
    this._configurationId = 1;
    this._interfaceId = 0;
    this._transaction = 0;
    this._progress = 0;
    this.enableTrace = false;
}
DfuDevice.prototype = {
    constructor: DfuDevice,
    _64KB_PAGE_SIZE: 0x10000,
    _DFU_DETACH_TIMEOUT: 1000,
    _CONTROL_BLOCK_SIZE: 32,
    commandList: {
        DETACH:     0,
        DNLOAD:     1,
        UPLOAD:     2,
        GETSTATUS:  3,
        CLRSTATUS:  4,
        GETSTATE:   5,
        ABORT:      6
    },
    stateList: {
        APP_IDLE:                   0x00,
        APP_DETACH:                 0x01,
        DFU_IDLE:                   0x02,
        DFU_DOWNLOAD_SYNC:          0x03,
        DFU_DOWNLOAD_BUSY:          0x04,
        DFU_DOWNLOAD_IDLE:          0x05,
        DFU_MANIFEST_SYNC:          0x06,
        DFU_MANIFEST:               0x07,
        DFU_MANIFEST_WAIT_RESET:    0x08,
        DFU_UPLOAD_IDLE:            0x09,
        DFU_ERROR:                  0x0A
    },
    statusList: {
        OK:                         0x00,
        ERROR_TARGET:               0x01,
        ERROR_FILE:                 0x02,
        ERROR_WRITE:                0x03,
        ERROR_ERASE:                0x04,
        ERROR_CHECK_ERASED:         0x05,
        ERROR_PROG:                 0x06,
        ERROR_VERIFY:               0x07,
        ERROR_ADDRESS:              0x08,
        ERROR_NOTDONE:              0x09,
        ERROR_FIRMWARE:             0x0A,
        ERROR_VENDOR:               0x0B,
        ERROR_USBR:                 0x0C,
        ERROR_POR:                  0x0D,
        ERROR_UNKNOWN:              0x0E,
        ERROR_STALLEDPKT:           0x0F
    },
    getCommandList: {
        '8051': {
            'bootloader':   [ 0x00, 0x00 ],
            'ID1':          [ 0x00, 0x01 ],
            'ID2':          [ 0x00, 0x02 ],
            'manufacturer': [ 0x01, 0x30 ],
            'family':       [ 0x01, 0x31 ],
            'product_name': [ 0x01, 0x60 ],
            'product_rev':  [ 0x01, 0x61 ],
            'BSB':          [ 0x01, 0x00 ],
            'SBV':          [ 0x01, 0x01 ],
            'SSB':          [ 0x01, 0x05 ],
            'EB':           [ 0x01, 0x06 ],
            'HSB':          [ 0x02, 0x00 ]
        },
        'AVR': {
            'bootloader':   [ 0x00, 0x00 ],
            'ID1':          [ 0x00, 0x01 ],
            'ID2':          [ 0x00, 0x02 ],
            'manufacturer': [ 0x01, 0x30 ],
            'family':       [ 0x01, 0x31 ],
            'product_name': [ 0x01, 0x60 ],
            'product_rev':  [ 0x01, 0x61 ]
        },
        'AVR32': {
            'bootloader':   [ 0x04, 0x00 ],
            'ID1':          [ 0x04, 0x01 ],
            'ID2':          [ 0x04, 0x02 ],
            'manufacturer': [ 0x05, 0x00 ],
            'family':       [ 0x05, 0x01 ],
            'product_name': [ 0x05, 0x02 ],
            'product_rev':  [ 0x05, 0x03 ]
        },
        'XMEGA': {
            'bootloader':   [ 0x04, 0x00 ],
            'ID1':          [ 0x04, 0x01 ],
            'ID2':          [ 0x04, 0x02 ],
            'manufacturer': [ 0x05, 0x00 ],
            'family':       [ 0x05, 0x01 ],
            'product_name': [ 0x05, 0x02 ],
            'product_rev':  [ 0x05, 0x03 ]
        }
    },
    eraseModeList: {
        ERASE_BLOCK_0:      0x00,
        ERASE_BLOCK_1:      0x20,
        ERASE_BLOCK_2:      0x40,
        ERASE_BLOCK_3:      0x80,
        ERASE_BLOCK_ALL:    0xFF
    },
    findDevice: function(options, callback) {
        var self = this;
        var vendorId = options.vendorId || 0;
        var productId = options.productId || 0;
        var callback = (typeof callback === 'function') ? callback : function() {};
        //console.log(vendorId + ',' + productId);
        chrome.usb.getDevices({ 'vendorId': vendorId, 'productId': productId }, function(devices) {
            //console.log(device);
            if (devices && devices.length) {
                var device = devices[0];
                callback.call(self, device.productName);
            }
            else {
                callback.call(self, null);
            }
        });
    },
    initDevice: function(options, callback) {
        this._trace('dfu_init_device', arguments);
        var self = this;
        var vendorId = options.vendorId || 0;
        var productId = options.productId || 0;
        var initialAbort = options.initialAbort || false;
        var callback = (typeof callback === 'function') ? callback : function() {};
        chrome.usb.findDevices({ 'vendorId': vendorId, 'productId': productId }, function(connections) {
            if (connections) {
                if (connections.length > 0) {
                    console.log(connections);
                    self._handle = connections[0];
                    chrome.usb.setConfiguration(self._handle, self._configurationId, function() {
                        if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                        chrome.usb.claimInterface(self._handle, self._interfaceId, function() {
                            if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                            self._makeIdle({ 'initialAbort': initialAbort }, callback);
                        });
                    });
                }
                else {
                    var message = 'Device could not be found.';
                    console.log(message);
                    callback.call(self, new Error(message));
                }
            }
            else {
                var message = 'Permission denied.';
                console.log(message);
                callback.call(self, new Error(message));
            }
        });
    },
    uninitDevice: function(options, callback) {
        this._trace('dfu_uninit_device', arguments);
        var self = this;
        var callback = (typeof callback === 'function') ? callback : function() {};
        chrome.usb.releaseInterface(self._handle, self._interfaceId, function() {
            if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
            chrome.usb.closeDevice(self._handle, function() {
                if (chrome.runtime.lastError) console.log(chrome.runtime.lastError);
                callback.call(self, null);
            });
        });
    },
    readConfig: function(options, callback) {
        this._trace('atmel_read_config', arguments);
        var self = this;
        var name = options.name || '';
        var callback = (typeof callback === 'function') ? callback : function() {};
        if (name in self.getCommandList['AVR']) {
            var command = self.getCommandList['AVR'][name];
            self._readCommand({ 'command': command }, function(error, result) {
                callback.call(self, error, result);
            });
        }
        else {
            var message = 'unknown config: ' + name;
            console.log(message);
            callback.call(self, new Error(message));
        }
    },
    eraseFlash: function(options, callback) {
        this._trace('atmel_erase_flash', arguments);
        var self = this;
        var mode = options.mode || this.eraseModeList.ERASE_BLOCK_ALL;
        var data = new Uint8Array([ 0x04, 0x00, mode ]);
        var callback = (typeof callback === 'function') ? callback : function() {};
        var start = new Date().getTime();
        async.waterfall([
            async.apply(self.__download.bind(self), { 'data': data }),
            function(next) {
                var retries = 0;
                async.retry({ 'times': 10, 'interval': 100 }, function(_next, error) {
                    if (!error) {
                        var end = new Date().getTime();
                        if ((end - start) / 1000 > 20) {
                            var error = new Error('CMD_ERASE time limit 20s exceeded.');
                            _next(error, error);
                        }
                        self.__getStatus({}, function(error, status) {
                            retries++;
                            if (!error) {
                                if (status.status == self.statusList.ERROR_NOTDONE &&
                                        status.state == self.stateList.DFU_DOWNLOAD_BUSY) {
                                    var error = new Error('CMD_ERASE status check ' + retries + ' returned nonzero.');
                                    _next(error, null);
                                }
                                else {
                                    _next(null, null);
                                }
                            }
                        });
                    }
                    else {
                        _next(error, error);
                    }
                }, function(error) {
                    next(error)
                });
            }
        ], callback.bind(self));
    },
    flash: function(options, callback) {
        this._trace('atmel_flash', arguments);
        var self = this;
        var bufferOut = options.bufferOut;
        var eeprom = options.eeprom || false;
        var force = options.force || false;
        var callback = (typeof callback === 'function') ? callback : function() {};
        var progress = (typeof options.progress === 'function') ? options.progress : function() {};
        if (bufferOut instanceof DfuBufferOut) {
            bufferOut.prepareBuffer();
            //console.log(bufferOut);
            console.log('Flash available from {0} (64kB p. {1}), 0x{2} bytes.'.format(
                        bufferOut.validRange,
                        bufferOut.validRange.pageRange(self._64KB_PAGE_SIZE),
                        bufferOut.validSize().toString(16)));
            console.log('Data start @ 0x{0}: 64kB p {1}; {2}B p 0x{3} + 0x{4} offset.'.format(
                        bufferOut.dataRange.start.toString(16),
                        bufferOut.dataRange.startPage(self._64KB_PAGE_SIZE),
                        bufferOut.pageSize,
                        bufferOut.firstPage(),
                        bufferOut.offsetInPage(bufferOut.dataRange.start)));
            console.log('Data end @ 0x{0}: 64kB p {1}; {2}B p 0x{3} + 0x{4} offset.'.format(
                        bufferOut.dataRange.end.toString(16),
                        bufferOut.dataRange.endPage(self._64KB_PAGE_SIZE),
                        bufferOut.pageSize,
                        bufferOut.lastPage(),
                        bufferOut.offsetInPage(bufferOut.dataRange.end)));
            console.log('Totals: 0x{0} bytes, {1} {2}B pages, {3} 64kB bytes pages.'.format(
                        bufferOut.dataSize().toString(16),
                        bufferOut.numberOfPages(),
                        bufferOut.pageSize,
                        bufferOut.numberOfPages(self._64KB_PAGE_SIZE)));
            if (!bufferOut.isDataInsideValid()) {
                var message = 'ERROR: Data exists outside of the valid target flash region.';
                console.log(message);
                callback.call(self, new Error(message));
            }
            else if (!bufferOut.hasData()) {
                var message = 'ERROR: No valid data to flash.';
                console.log(message);
                callback.call(self, new Error(message));
            }

            self._progress = 0;
            progress.call(self, self._progress);
            async.waterfall([
                function(next) {
                    if (!force) {
                        self._checkBlank({ 'range': bufferOut.dataRange }, function(error, result) {
                            if (!error) {
                                if (result) {
                                    next(null);
                                }
                                else {
                                    var message = 'The target memory is not blank.';
                                    console.log(message);
                                    next(new Error(message));
                                }
                            }
                            else {
                                next(error);
                            }
                        });
                    }
                    else {
                        next(null);
                    }
                },
                function(next) {
                    self._selectMemoryUnit({}, function(error, result) {
                        next(null);
                    });
                },
                function(next) {
                    console.log('Programming 0x' + bufferOut.dataSize().toString(16) + ' bytes...');
                    var memoryPage = -1;
                    bufferOut.rewindBlock();
                    //console.log(bufferOut.blockRange);
                    async.whilst(bufferOut.hasRemainingBlock.bind(bufferOut), function(_next) {
                        async.waterfall([
                            function(__next) {
                                if (memoryPage != bufferOut.blockPage(self._64KB_PAGE_SIZE)) {
                                    memoryPage = bufferOut.blockPage(self._64KB_PAGE_SIZE);
                                    self._selectPage({ 'page': memoryPage }, __next);
                                }
                                else {
                                    __next(null);
                                }
                            },
                            async.apply(self._flashBlock.bind(self), { 'bufferOut': bufferOut, 'eeprom': eeprom }),
                            function(__next) {
                                self._updateProgress(bufferOut, progress);
                                __next(null);
                            }
                        ], function(error) {
                            if (error) {
                                var message = 'Error flashing the block';
                                console.log(message);
                                _next(new Error(message));
                            }
                            else {
                                _next(null);
                            }
                        });
                    }, function(error) {
                        next(error);
                    });
                }
            ], function(error) {
                if (!error) {
                    console.log('Success');
                }
                callback.call(self, error);
            });
        }
        else {
            var message = 'invalid buffer';
            console.log(message);
            callback.call(self, new Error(message));
        }
    },
    readFlash: function(options, callback) {
        this._trace('atmel_read_flash', arguments);

    },
    startApp: function(options, callback) {
        this._trace('atmel_start_app', arguments);
        var self = this;
        var reset = options.reset;
        var data = reset ?
            new Uint8Array([ 0x04, 0x03, 0x00 ]):
            new Uint8Array([ 0x04, 0x03, 0x01, 0x00, 0x00 ]);
        async.waterfall([
            async.apply(self.__download.bind(self), { 'data': data }),
            async.apply(self.__download.bind(self), {}),
        ], function(error) {
            callback.call(self, error);
        });
    },
    _trace: function(name, args) {
        if (this.enableTrace) {
            console.log('TRACE: ' + name + '(%o)', args);
        }
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
    _makeIdle: function(options, callback) {
        var self = this;
        var initialAbort = options.initialAbort || false;
        async.waterfall([
            function(next) {
                if (initialAbort) {
                    self.__abort({}, next);
                }
                else {
                    next(null);
                }
            },
            function(next) {
                async.retry({ 'times': 5, 'interval': 0 }, function(next, results) {
                    self._makeIdleSub({}, function(error, result) {
                        if (!error && !result) {
                            next(new Error());
                        }
                        else {
                            next(error);
                        }
                    });
                }, function(error) {
                    if (error) {
                        console.log('Not able to transition the device into the dfuIDLE state.');
                    }
                    next(error);
                });
            }
        ], callback.bind(self));
    },
    _makeIdleSub: function(options, callback) {
        var self = this;
        self.__getStatus({}, function(error, status) {
            if (!error) {
                console.log('State: ', status.state);
                switch (status.state) {
                    case self.stateList.DFU_IDLE:
                        if (status.status == self.statusList.OK) {
                            callback.call(self, null, true);
                        }
                        else {
                            self.__clearStatus({}, function(error) {
                                callback.call(self, error, false);
                            });
                        }
                        break;
                    case self.stateList.DFU_DOWNLOAD_SYNC:
                    case self.stateList.DFU_DOWNLOAD_IDLE:
                    case self.stateList.DFU_UPLOAD_IDLE:
                    case self.stateList.DFU_MANIFEST_SYNC:
                    case self.stateList.DFU_DOWNLOAD_BUSY:
                    case self.stateList.DFU_MANIFEST:
                        self.__abort({}, function(error) {
                            callback.call(self, error, false);
                        });
                        break;
                    case self.stateList.DFU_ERROR:
                        self.__clearStatus({}, function(error) {
                            callback.call(self, error, false);
                        });
                        break;
                    case self.stateList.APP_IDLE:
                        self.__detach({}, function(error) {
                            callback.call(self, error, false);
                        });
                        break;
                    case self.stateList.APP_DETACH:
                    case self.stateList.DFU_MANIFEST_WAIT_RESET:
                        console.log('Resetting the device');
                        self.reset({}, function(error) {
                            callback.call(self, error, false);
                        });
                    default:
                        break;
                }
            }
            else {
                self.__clearStatus({}, function(error) {
                    callback.call(self, error, false);
                });
            }
        });
    },
    _readCommand: function(options, callback) {
        this._trace('atmel_read_command', arguments);
        var self = this;
        var command = options.command || [ 0, 0 ];
        var data = new Uint8Array([ 0x05 ].concat(command));
        async.waterfall([
            async.apply(self.__download.bind(self), { 'data': data }),
            async.apply(self.__checkStatus.bind(self), {}),
            async.apply(self.__upload.bind(self), { 'size': 1 })
        ], function(error, result) {
            if (!error) {
                callback.call(self, null, { 'data': result[0] });
                return;
            }
            var message = 'atmel_read_command failed';
            console.log(message);
            callback.call(self, new Error(message), result);
        });
    },
    _selectPage: function(options, callback) {
        this._trace('atmel_select_page', arguments);
        var self = this;
        var page = options.page || 0;
        console.log('Selecting page ' + page + ', address 0x' + (page * self._64KB_PAGE_SIZE).toString(16) + '.');
        var data = new Uint8Array([ 0x06, 0x03, 0x00, page ]);
        async.waterfall([
            async.apply(self.__download.bind(self), { 'data': data }),
            async.apply(self.__checkStatus.bind(self), {})
        ], function(error) {
            if (!error) {
                callback.call(self, null);
                return;
            }
            var message = 'atmel_select_page failed';
            console.log(message);
            callback.call(self, new Error(message));
        });
    },
    _selectMemoryUnit: function(options, callback) {
        this._trace('atmel_select_memory_unit', arguments);
        callback.call(this, null);
    },
    _checkBlank: function(options, callback) {
        this._trace('atmel_blank_check', arguments);
        var self = this;
        var range = options.range || new DfuRange();
        var start;
        var end;
        if (range.isValid()) {
            start = range.start;
            end = range.end
        }
        else {
            start = options.start || 0;
            end = options.end || 0;
        }
        var range = new DfuRange(self._64KB_PAGE_SIZE, start, end);
        console.log('Checking memory from {0}...'.format(range));
        async.waterfall([
            function(next) {
                self._selectMemoryUnit({}, function(error) {
                    next(error);
                });
            },
            function(next) {
                var firstPage = range.startPage();
                async.timesSeries(range.numberOfPages(), function(n, _next) {
                    var currentPage = firstPage + n;
                    var start = range.startInPage(null, currentPage);
                    var end = range.endInPage(null, currentPage);
                    async.waterfall([
                        async.apply(self._selectPage.bind(self), { 'page': currentPage }),
                        async.apply(self._checkBlankInPage.bind(self), { 'start': start, 'end': end }),
                        function(result, __next) {
                            if (result) {
                                console.log('Flash blank from 0x{0} to 0x{1}'.format(
                                            start.toString(16), end.toString(16)));
                                __next(null, true);
                            }
                            else {
                                var message = 'Flash NOT blank beginning at 0x{0}.'.format(start.toString(16));
                                console.log(message);
                                __next(new Error(message), false);
                            }
                        }
                    ], _next);
                }, function(error, result) {
                    if (arguments.length > 1) {
                        next(error, result);
                    }
                    else {
                        next(error);
                    }
                });
            }
        ], function(error, result) {
            if (arguments.length > 1) {
                callback.call(this, null, (error == null));
            }
            else {
                callback.call(this, error);
            }
        });
    },
    _checkBlankInPage: function(options, callback) {
        this._trace('__atmel_blank_page_check', arguments);
        var self = this;
        var start = options.start || 0;
        var end = options.end || 0;
        if (start > end) {
            var message = 'ERROR: End address 0x{0} before start address 0x{1}.'.format(
                    start.toString(16), end.toString(16));
            console.log(message);
            callback.call(self, new Error(message), false);
        }
        else if (end >= self._64KB_PAGE_SIZE) {
            var message = 'ERROR: Address out of 64kb (0x10000) byte page range.';
            console.log(message);
            callback.call(self, new Error(message), false);
        }
        else {
            var data = new Uint8Array([ 0x03, 0x01, 0xff & (start >> 8), 0xff & start, 0xff & (end >> 8), 0xff & end ]);
            async.waterfall([
                async.apply(self.__download.bind(self), { 'data': data }),
                async.apply(self.__checkStatus.bind(self), {})
            ], function(error, results) {
                if (!error) {
                    callback.call(this, null, true);
                }
                else {
                    if (results.status == self.statusList.ERROR_CHECK_ERASED) {
                        console.log('Region is NOT blank.');
                        async.waterfall([
                            function(next) {
                                if (results.state == self.stateList.DFU_ERROR) {
                                    self.__clearStatus({}, next);
                                }
                                else {
                                    next(null);
                                }
                            },
                            async.apply(self.__upload.bind(self), { 'size': 2 }),
                            function(result, next) {
                                var address = (result[0] << 8) + result[1];
                                console.log(' First non-blank address in region is 0x{0}.'.format(address.toString(16)));
                                next(null);
                            }
                        ], function(error) {
                            callback.call(self, error, false);
                        });
                    }
                    else {
                        async.waterfall([
                            function(next) {
                                if (results.state == self.stateList.DFU_ERROR) {
                                    self.__clearStatus({}, next);
                                }
                            }
                        ], function(error) {
                            callback.call(self, error, false);
                        });
                    }
                }
            });
        }
    },
    _flashBlock: function(options, callback) {
        this._trace('__atmel_flash_block', arguments);
        var self = this;
        var bufferOut = options.bufferOut;
        var eeprom = options.eeprom || false;
        var force = options.force || false;
        var callback = (typeof callback === 'function') ? callback : function() {};
        if (bufferOut instanceof DfuBufferOut) {
            if (!bufferOut.blockRange.isValid()) {
                var message = 'ERROR: End address 0x{0} before start address 0x{1}.'.format(
                        bufferOut.blockRange.start.toString(16), bufferOut.blockRange.end.toString(16));
                console.log(message);
                callback.call(self, new Error(message));
            }
            else if (bufferOut.blockSize() > bufferOut.MAX_TRANSFER_SIZE) {
                var message = 'ERROR: 0x{0} byte message > MAX TRANSFER SIZE (0x{1}).'.format(
                        bufferOut.blockSize(), bufferOut.MAX_TRANSFER_SIZE.toString(16));
                console.log(message);
                callback.call(self, new Error(message));
            }
            else {
                //console.log(bufferOut.blockRange)
                var header = self._populateHeader(bufferOut.blockRange.startInPage(self._64KB_PAGE_SIZE), bufferOut.blockRange.endInPage(self._64KB_PAGE_SIZE), eeprom);
                var footer = self._populateFooter(0xffff, 0xffff, 0xffff);
                var block = bufferOut.getBlock();
                var data = new Uint8Array(header.length + block.length + footer.length);
                //console.log(block);
                data.set(header, 0);
                data.set(block, header.length);
                data.set(footer, header.length + block.length);
                async.waterfall([
                    async.apply(self.__download.bind(self), { 'data': data }),
                    async.apply(self.__checkStatus.bind(self), {})
                ], function(error, result) {
                    if (!error) {
                        console.log('Page write success.');
                        callback.call(self, null);
                    }
                    else {
                        async.waterfall([
                            function(next) {
                                if (result) {
                                    self.__clearStatus({}, next);
                                }
                                else {
                                    next(error);
                                }
                            }
                        ], function(error) {
                            if (result) {
                                error = new Error('Page write unsuccessful (err {0}).'.format(result.status));
                            }
                            console.log(error.message);
                        });
                    }
                });
            }
        }
        else {
            var message = 'invalid buffer';
            console.log(message);
            callback.call(self, new Error(message));
        }
    },
    _populateHeader: function(start, end, eeprom) {
        this._trace('atmel_flash_populate_header', arguments);
        var controlBlockSize = this._CONTROL_BLOCK_SIZE;
        var alignment = 0;
        var size = controlBlockSize + alignment;
        var header = new Uint8Array(size);
        header.set([ 0x01, (eeprom? 0x01: 0x00), 0xff & (start >> 8), 0xff & start, 0xff & (end >> 8), 0xff & end ]);
        return header;
    },
    _populateFooter: function(vendorId, productId, bcdFirmware) {
        this._trace('atmel_flash_populate_footer', arguments);
        var crc = 0;
        var size = 16;
        var footer = new Uint8Array(size);
        footer.set([ 0x00, 0x00, 0x00, 0x00, size, 'D'.charCodeAt(0), 'F'.charCodeAt(0), 'U'.charCodeAt(0), 0x01, 0x10,
                0xff & (vendorId >> 8), 0xff & vendorId, 0xff & (productId >> 8), 0xff & productId, 0xff & (bcdFirmware >> 8), 0xff & bcdFirmware ]);
        return footer;
    },
    __detach: function(options, callback) {
        this._trace('dfu_detach', arguments);
        var timeout = options.timeout || this._DFU_DETACH_TIMEOUT;
        this.___transferOut({ 'command': this.commandList.DETACH, 'value': timeout }, function(error, result) {
            if (!error) {
                callback.call(this, null);
                return;
            }
            var message = 'dfu_detach failed';
            console.log(message);
            callback.call(this, new Error(message));
        });
    },
    __download: function(options, callback) {
        this._trace('dfu_download', arguments);
        var data = options.data || new Uint8Array(0);
        this.___transferOut({ 'command': this.commandList.DNLOAD, 'value': this._transaction, 'data': data }, function(error, result) {
            if (!error) {
                this._transaction++;
                if (this._transaction > 0xFFFF) {
                    this._transaction = 0;
                }
                if (result) {
                    callback.call(this, error);
                    return;
                }
            }
            var message = 'dfu_download failed';
            console.log(message);
            callback.call(this, new Error(message));
        });
    },
    __upload: function(options, callback) {
        this._trace('dfu_upload', arguments);
        var size = options.size || 0;
        this.___transferIn({ 'command': this.commandList.UPLOAD, 'value': this._transaction, 'size': size }, function(error, result) {
            if (!error) {
                this._transaction++;
                if (this._transaction > 0xFFFF) {
                    this._transaction = 0;
                }
                if (result) {
                    callback.call(this, error, result);
                    return;
                }
            }
            var message = 'dfu_upload failed';
            console.log(message);
            callback.call(this, new Error(message), result);
        });
    },
    __getStatus: function(options, callback) {
        this._trace('dfu_get_status', arguments);
        var size = 6;
        this.___transferIn({ 'command': this.commandList.GETSTATUS, 'size': size }, function(error, result) {
            if (!error) {
                if (result) {
                    if (result.length == size) {
                        callback.call(this, error, {
                            'status': result[0],
                            'pollTimeout': (result[1]) + (result[2] << 8) + (result[3] << 16),
                            'state': result[4],
                            'string': result[5]
                        });
                        return;
                    }
                }
            }
            var message = 'dfu_get_status failed';
            console.log(message);
            callback.call(this, new Error(message), false);
        });
    },
    __checkStatus: function(options, callback) {
        var check = options.check || this.statusList.OK;
        this.__getStatus({}, function(error, result) {
            if (!error) {
                if (result && result.status == check) {
                    callback.call(this, null);
                    return;
                }
                else {
                    var message = 'status(' + result.status + ') was not OK.';
                    console.log(message);
                    error = new Error(message);
                }
            }
            callback.call(this, error, result);
        });
    },
    __clearStatus: function(options, callback) {
        this._trace('dfu_clear_status', arguments);
        this.___transferOut({ 'command': this.commandList.CLRSTATUS }, function(error, result) {
            if (!error) {
                callback.call(this, null);
                return;
            }
            var message = 'dfu_clear_status failed';
            console.log(message);
            callback.call(this, new Error(message));
        });
    },
    __getState: function(options, callback) {
        this._trace('dfu_get_state', arguments);
        this.___transferIn({ 'command': this.commandList.GETSTATE, 'size': 1 }, function(error, result) {
            if (!error) {
                callback.call(this, null, result);
                return;
            }
            var message = 'dfu_get_state failed';
            console.log(message);
            callback.call(this, new Error(message), result);
        });
    },
    __abort: function(options, callback) {
        this._trace('dfu_abort', arguments);
        this.___transferOut({ 'command': this.commandList.ABORT }, function(error, result) {
            if (!error) {
                callback.call(this, null);
                return;
            }
            var message = 'dfu_abort failed';
            console.log(message);
            callback.call(this, new Error(message));
        });
    },
    ___transferIn: function(options, callback) {
        var self = this;
        if (self._handle) {
            var command = options.command || 0;
            var value = options.value || 0;
            var size = options.size || 0;
            chrome.usb.controlTransfer(self._handle, {
                'direction': 'in',
                'recipient': 'interface',
                'requestType': 'class',
                'request': command,
                'value': value,
                'index': self._interfaceId,
                'length': size
            }, function(info) {
                if (info.resultCode == 0) {
                    var data = new Uint8Array(info.data);
                    //console.log('transfer_in: ' + command + ', ' + value);
                    //console.log(data);
                    callback.call(self, null, data);
                    return;
                }
                var message = 'dfu_transfer_in failed';
                console.log(message);
                callback.call(this, new Error(message), false);
            });
        }
        else {
            var message = 'device not initialized';
            console.log(message);
            callback.call(this, new Error(message), false);
        }
    },
    ___transferOut: function(options, callback) {
        var self = this;
        if (self._handle) {
            var command = options.command || 0;
            var value = options.value || 0;
            var size = options.size || 0;
            var data = (options.data && options.data.buffer) || new ArrayBuffer(0);
            chrome.usb.controlTransfer(self._handle, {
                'direction': 'out',
                'recipient': 'interface',
                'requestType': 'class',
                'request': command,
                'value': value,
                'index': self._interfaceId,
                'data': data
            }, function(info) {
                if (info.resultCode == 0) {
                    //console.log('transfer_out: ' + command + ', ' + value);
                    //console.log(options.data);
                    callback.call(self, null, true);
                    return;
                }
                var message = 'dfu_transfer_out failed';
                console.log(message);
                callback.call(this, new Error(message), false);
            });
        }
        else {
            var message = 'device not initialized';
            console.log(message);
            callback.call(this, new Error(message), false);
        }
    }
};
