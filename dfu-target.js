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

function DfuTarget(name) {
    if (name in this.targetList) {
        var target = this.targetList[name];
        this.deviceType = target.deviceType;
        this.vendorId = target.vendorId;
        this.chipId = target.chipId;
        this.memorySize = target.memorySize;
        this.bootloaderSize = target.bootloaderSize;
        this.bootloaderAtHighMem = target.bootloaderAtHighMem;
        this.flashPageSize = target.flashPageSize;
        this.initialAbort = target.initialAbort;
        this.honorInterfaceClass = target.honorInterfaceClass;
        this.eepromPageSize = target.eepromPageSize;
        this.eepromMemorySize = target.eepromMemorySize;

        this.memoryAddressTop = this.memorySize - 1;
        this.memoryAddressBottom = 0;
        this.flashAddressTop = this.bootloaderAtHighMem ?
            this.memoryAddressTop - this.bootloaderSize :
            this.memoryAddressTop;
        this.flashAddressBottom = this.bootloaderAtHighMem ?
            this.memoryAddressBottom :
            this.memoryAddressBottom + this.bootloaderSize;
        this.bootloaderTop = this.bootloaderAtHighMem ?
            this.memoryAddressTop : this.bootloaderSize - 1;
        this.bootloaderBottom = this.bootloaderAtHighMem ?
            this.memorySize - this.bootloaderSize : this.memoryAddressBottom;
    }
    else {
        return null;
    }
}

DfuTarget.prototype = {
    constructor: DfuTarget,
    targetList: {
        'atmega32u4': {
            'deviceType':           'AVR',
            'vendorId':             0x03EB,
            'chipId':               0x2FF4,
            'memorySize':           0x8000,
            'bootloaderSize':       0x1000,
            'bootloaderAtHighMem':  true,
            'flashPageSize':        128,
            'initialAbort':         true,
            'honorInterfaceClass':  false,
            'eepromPageSize':       128,
            'eepromMemorySize':     0x0400
        },
        'atmega16u2': {
            'deviceType':           'AVR',
            'vendorId':             0x03EB,
            'chipId':               0x2FEF,
            'memorySize':           0x4000,
            'bootloaderSize':       0x1000,
            'bootloaderAtHighMem':  true,
            'flashPageSize':        128,
            'initialAbort':         true,
            'honorInterfaceClass':  false,
            'eepromPageSize':       128,
            'eepromMemorySize':     0x0200
        },
        'atmega32u2': {
            'deviceType':           'AVR',
            'vendorId':             0x03EB,
            'chipId':               0x2FF0,
            'memorySize':           0x8000,
            'bootloaderSize':       0x1000,
            'bootloaderAtHighMem':  true,
            'flashPageSize':        128,
            'initialAbort':         true,
            'honorInterfaceClass':  false,
            'eepromPageSize':       128,
            'eepromMemorySize':     0x0400
        }
    },
};
