//Intel Hex record types
const DATA = 0,
    END_OF_FILE = 1, 
    EXT_SEGMENT_ADDR = 2,
    START_SEGMENT_ADDR = 3,
    EXT_LINEAR_ADDR = 4,
    START_LINEAR_ADDR = 5;

function validateLine(line) {
    var pos = 0;
    if(line[pos] === ':') {
        return true;
    }else{
        return false;
    }
}
// hex : string (hex file data)
function parseIntelHex(hex, callback) {
    //split each line by \n
    var lines = hex.split("\n");
    var hexData = new Array();
    var highAddress = 0;
    var startSegmentAddress = null;
    var startLinearAddress = null
    //parse each line   
    for(var index in lines) {
        line = lines[index];
        if(!validateLine(line)) {
            throw new Error("invalid line!");
        }
        var pos = 1;
        //get data length
        var byteCount = parseInt(line.substr(pos, 2), 16);
        pos += 2;
        //get address
        var address = parseInt(line.substr(pos, 4), 16);
        pos += 4;
        //get record type
        var recordType = parseInt(line.substr(pos, 2), 16);
        pos += 2;
        //get data
        var data = line.substr(pos, byteCount*2);
        //if parser gets eof then exit the loop
        if(recordType === 1) {
            break;
        }
        //record type
        switch (recordType) {
            case DATA:
                for (var i = 0; i < byteCount; i++) {
                    var absoluteAddress = highAddress + address + i;
                    var b = parseInt(data.slice(i * 2, i * 2 + 2), 16);
                    //console.log(absoluteAddress.toString(16));
                    var dataWithAddress = [
                        {
                        "address": absoluteAddress,
                        "data": b
                        }
                    ]
                    hexData.push(dataWithAddress);
                    callback(absoluteAddress, b);
                }
                break;
            case EXT_SEGMENT_ADDR:
                highAddress = parseInt(data, 16) << 4;
                break;
            case EXT_LINEAR_ADDR:
                highAddress = parseInt(data, 16) << 16;
                break;
            case START_LINEAR_ADDR:
                startLinearAddress = parseInt(data, 16);
                break;
            case START_SEGMENT_ADDR:
                startSegmentAddress = parseInt(dataField, 16);
                break;
        }
    }
    //console.log(hexData);
}

function test() {
    var hex = document.getElementById("text").value;
    parseIntelHex(hex);
}

