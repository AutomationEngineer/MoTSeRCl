var Net = require('net');

function connect(context){
    context.socket = Net.createConnection({port: context.options.port, host:context.options.host}, function() {
        console.log(new Date().toISOString() + context.namePad + ' connected to modbus tcp server');

        context.socket.on('data', function(data) {
            if (!context.requestActive) {
                console.log(new Date().toISOString() + context.namePad + ' unexpected data: ' + data.toString('hex'));
                return;
            }

            clearTimeout(context.responseTimer);


            console.log(new Date().toISOString() + context.namePad + '->' + data.toString('hex'));

            if (context.currentRequest && typeof context.currentRequest.callback === "function") {
                context.currentRequest.callback(data.slice(6,data.length));
            }

            context.requestActive = false;

            context.currentRequest = undefined;
            write(context);
        });
    });

    context.socket.on('error', function(error) {
        console.log(new Date().toISOString() + context.namePad + ' socket error: ' + error);
        //setTimeout(connect, 5000, context);
    });

    context.socket.on('close', function() {
        console.log(new Date().toISOString() + context.namePad + ' server has dropped the connection');
        setTimeout(connect, 5000, context);
    });
}

function write(context) {
    if(!context.currentRequest) {
        context.currentRequest = context.reqQeue.shift();
    }


    if(context.currentRequest) {
        if(context.socket.destroyed || context.socket.connecting){
            console.log(new Date().toISOString() + context.namePad + ' error writing to serial server: socket destroyed');
            if (typeof context.currentRequest.callback === "function") {
                context.currentRequest.callback(new Buffer([context.currentRequest.data[0], context.currentRequest.data[1] + 0x80, 10])); //Return exception path unavailable
            }
            context.currentRequest = undefined;
            write(context);
            return;
        }

        context.socket.write(context.currentRequest.data, function (err, results){
            if (err) {
                console.log(new Date().toISOString() + context.namePad + ' error writing to serial server: ' + err);
                if (typeof context.currentRequest.callback === "function") {
                    context.currentRequest.callback(new Buffer([context.currentRequest.data[0], context.currentRequest.data[1] + 0x80, 10])); //Return exception path unavailable
                }
                context.currentRequest = undefined;
                write(context);
            } else {
                context.requestActive = true;

                console.log(new Date().toISOString() + context.namePad + '<-' + context.currentRequest.data.toString('hex'));

                context.responseTimer = setTimeout(timeoutEnd, context.responseTimeout, context);
            }
        });
    } else {
        //console.log(new Date().toISOString() + ' no pending serial request');
    }
}


function TcpClient(options) {

    var context = this;
    context.options = options;

    this.responseTimeout = options.responseTimeout?options.responseTimeout:1000;


    context.namePad = ('                          ' + context.options.host + ':' +  context.options.port).slice(-26);
    context.reqQeue = [];
    context.receiveBuffer = new Buffer(256);
    context.requestActive = false;
    context.transactionId = 1;

    connect(context);
}

function timeoutEnd(context) {

    context.requestActive = false;

    console.log(new Date().toISOString() + context.namePad + ' timeout end');

    if (typeof context.currentRequest.callback === "function") {
        context.currentRequest.callback(new Buffer([context.currentRequest.data[0], context.currentRequest.data[1] + 0x80, 11])); //Return exception target device doesn't respond
    }

    context.currentRequest = undefined;
    write(context);
}


TcpClient.prototype.request = function(data, callback) {
    var context = this;

    var tmpbuf = new Buffer([0,0,0,0,0,0]);
    var buf = Buffer.concat([tmpbuf, data], data.length + 6);
    var req = {
        data:buf,
        callback:callback
    };

    if(context.transactionId++ > 0xFFFF) context.transactionId = 0;
    req.data.writeUInt16BE(context.transactionId, 0);
    req.data.writeUInt16BE(data.length, 4);

    if(context.currentRequest) {
        context.reqQeue.push(req);
    }else{
        context.currentRequest = req;
        write(context);
    }
};


module.exports = TcpClient;
