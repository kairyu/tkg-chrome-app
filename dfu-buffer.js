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

function DfuBuffer(totalSize, pageSize, offset) {
    this.totalSize = Math.floor(totalSize) || 0;
    this.pageSize = Math.floor(pageSize) || 0;
    this.offset = Math.floor(offset) || 0;
    this.dataRange = null;
    this.validRange = null;
    this.blockRange = null;
    this.data = null;
    this.dataMark = null;
    return this;
}
DfuBuffer.prototype = {
    constructor: DfuBuffer,
    BYTE_MAX:           0xFF,
    MARK_UNUSED:        0,
    MARK_USED:          1,
    ADDRESS_MASK:       0x7FFFFFFF,
    init: function(totalSize, pageSize, offset) {
        (typeof totalSize !== 'undefined') && (this.totalSize = Math.floor(totalSize));
        (typeof pageSize !== 'undefined') && (this.pageSize = Math.floor(pageSize));
        (typeof offset !== 'undefined') && (this.offset = Math.floor(offset));
        this.dataRange = new DfuRange(this.pageSize);
        this.validRange = new DfuRange(this.pageSize, 0, this.totalSize - 1);
        this.blockRange = new DfuRange(this.pageSize);
        this.data = new Uint8Array(this.validRange.size());
        this.dataMark = new Uint8Array(this.validRange.size());
        for (var i = 0; i < this.data.length; i++) this.data[i] = this.BYTE_MAX;
        for (var i = 0; i < this.dataMark.length; i++) this.dataMark[i] = this.MARK_UNUSED;
    },
    offsetValidRange: function() {
        return this.validRange.offset(this.offset);
    },
    dataSize: function() {
        return this.dataRange.size();
    },
    validSize: function() {
        return this.validRange.size();
    },
    usage: function() {
        return this.dataSize() / this.ValidSize();
    },
    firstPage: function(pageSize) {
        return this.dataRange.startPage(pageSize);
    },
    lastPage: function(pageSize) {
        return this.dataRange.endPage(pageSize);
    },
    numberOfPages: function(pageSize) {
        return this.dataRange.numberOfPages(pageSize);
    },
    offsetInPage: function(address) {
        return address % this.pageSize;
    },
    isInitialized: function() {
        return (this.data != null);
    },
    hasData: function() {
        return this.dataRange.isValid();
    },
    hasDataInPage: function(page) {
        for (var i = page * this.pageSize; i < (page + 1) * this.pageSize; i++) {
            if (this.isDataUsed(i)) {
                return true;
            }
        }
        return false;
    },
    isDataInsideValid: function() {
        return this.validRange.contains(this.dataRange);
    },
    _isValidAddress: function(address) {
        return this.validRange.offset(this.offset & this.ADDRESS_MASK).contains(address & this.ADDRESS_MASK);
    },
    _relativeAddress: function(address) {
        return (address & this.ADDRESS_MASK) - (this.offset & this.ADDRESS_MASK);
    },
    putData: function(address, data) {
        this.data[address] = data;
        this.markDataUsed(address);
        this.dataRange.inflate(address);
        //console.log('address: 0x{0}, data: {1}'.format(address.toString(16), data));
    },
    putBlank: function(address) {
        this.putData(address, this.BYTE_MAX);
    },
    getData: function(address) {
        return this.data[address];
    },
    fillPage: function(page) {
        for (var i = page * this.pageSize; i < (page + 1) * this.pageSize; i++) {
            if (!this.isDataUsed(i)) {
                this.putBlank(i);
            }
        }
    },
    isDataUsed: function(address) {
        return (this.dataMark[address] == this.MARK_USED);
    },
    markDataUsed: function(address) {
        this.dataMark[address] = this.MARK_USED;
    },
    markDataUnused: function(address) {
        this.dataMark[address] = this.MARK_UNUSED;
    },
    blockPage: function(pageSize) {
        return this.blockRange.startPage(pageSize);
    },
    blockSize: function() {
        return this.blockRange.size();
    },
    blockOffset: function() {
        return this.blockRange.start - this.dataRange.start;
    },
    getBlock: function() {
        var block = this.data.slice(this.blockRange.start, this.blockRange.end + 1);
        this.nextBlock();
        return block;
    },
    putBlock: function(block) {
        var start = this.blockRange.start;
        for (var i = 0; i < block.length; i++) {
            this.putData(start + i, block[i]);
        }
        this.nextBlock();
    },
    hasRemainingBlock: function() {
        return this.blockRange.isValid() && this.dataRange.contains(this.blockRange);
    },
    rewindBlock: function() {
        this.blockRange.start = this.dataRange.start;
        this.blockRange.end = this._findBlockEnd(this.blockRange.start);
    },
    nextBlock: function() {
        this.blockRange.start = this._findBlockStart(this.blockRange.end);
        this.blockRange.end = this._findBlockEnd(this.blockRange.start);
    }
};

function DfuBufferOut() {
}
DfuBufferOut.prototype = new DfuBuffer();
DfuBufferOut.prototype.MAX_TRANSFER_SIZE = 0x0400;
DfuBufferOut.prototype.prepareBuffer = function() {
    for (var page = this.firstPage(); page < this.lastPage(); page++) {
        if (this.hasDataInPage(page)) {
            this.fillPage(page);
        }
    }
};
DfuBufferOut.prototype.readHex = function(hex) {
    parseIntelHex(hex, this._processData.bind(this));
};
DfuBufferOut.prototype._processData = function(address, data) {
    if (this._isValidAddress(address)) {
        var relativeAddress = this._relativeAddress(address);
        this.putData(relativeAddress, data);
    }
    else {
        console.log('Address 0x{0} is outside valid range {1}.'.format(
                    address.toString(16), this.offsetValidRange()));
    }
};
DfuBufferOut.prototype._findBlockStart = function(end) {
    var start = end + 1;
    for (; start <= this.dataRange.end; start++) {
        if (this.isDataUsed(start)) break;
    }
    return start;
};
DfuBufferOut.prototype._findBlockEnd = function(start) {
    var end = start;
    for (; end <= this.dataRange.end; end++) {
        if (!this.isDataUsed(end)) break;
        if (end - start + 1 > this.MAX_TRANSFER_SIZE) break;
        if (Math.floor(end / this.pageSize) > Math.floor(start / this.pageSize)) break;
    }
    return end - 1;
};

function DfuRange(pageSize, start, end) {
    this.init(pageSize, start, end);
    return this;
}
DfuRange.prototype = {
    constructor: DfuRange,
    init: function(pageSize, start, end) {
        if (arguments.length) {
            this.pageSize = Math.floor(pageSize) || 0;
            this.set(start, end);
        }
        else {
            this.invalidate();
        }
    },
    set: function(start, end) {
        if (typeof start === 'undefined') {
            this.start = Infinity;
        }
        else {
            this.start = Math.floor(start);
        }
        if (typeof end === 'undefined') {
            this.end = -Infinity;
        }
        else {
            this.end = Math.floor(end);
        }
    },
    size: function() {
        return Math.floor(this.end - this.start + 1);
    },
    startInPage: function(pageSize, pageNumber) {
        var pageSize = Math.floor(pageSize) || this.pageSize;
        var start = this.start;
        if (arguments.length > 1) {
            start = Math.max(this.start, Math.floor(pageNumber) * pageSize);
        }
        return Math.floor(start % pageSize);
    },
    endInPage: function(pageSize, pageNumber) {
        var pageSize = pageSize || this.pageSize;
        var end = this.end;
        if (arguments.length > 1) {
            end = Math.min(this.end, Math.floor(pageNumber + 1) * pageSize - 1);
        }
        return Math.floor(end % pageSize);
    },
    startPage: function(pageSize) {
        var pageSize = pageSize || this.pageSize;
        return Math.floor(this.start / pageSize);
    },
    endPage: function(pageSize) {
        var pageSize = pageSize || this.pageSize;
        return Math.floor(this.end / pageSize);
    },
    numberOfPages: function(pageSize) {
        return this.endPage(pageSize) - this.startPage(pageSize) + 1;
    },
    pageRange: function(pageSize) {
        pageSize = pageSize || this.pageSize;
        return new DfuRange(pageSize, this.startPage(pageSize), this.endPage(pageSize));
    },
    invalidate: function() {
        this.start = Infinity;
        this.end = -Infinity;
    },
    isValid: function() {
        return (this.end >= this.start);
    },
    contains: function(value) {
        if (value instanceof DfuRange) {
            return (value.start >= this.start) && (value.end <= this.end);
        }
        else {
            value = Math.floor(value);
            return (value >= this.start) && (value <= this.end);
        }
    },
    intersect: function(value) {
        if (value instanceof DfuRange) {
            return this.contains(value.start) || this.contains(value.end);
        }
    },
    inflate: function(value) {
        value = Math.floor(value);
        this.start = Math.min(value, this.start);
        this.end = Math.max(value, this.end);
    },
    offset: function(value) {
        return new DfuRange(this.pageSize, this.start + value, this.end + value);
    },
    toString: function() {
        return '0x' + this.start.toString(16) + ' to ' + '0x' + this.end.toString(16);
    }
};
