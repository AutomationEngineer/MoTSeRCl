var TcpServer = require('./tcpServer');
var RtuServer = require('./rtuServer');
var RtuClient = require('./rtuClient');
var TcpClient = require('./tcpClient');
var fs = require('fs');

var cfgIndex = process.argv.indexOf("-c");
if((cfgIndex > 1) && (process.argv.length > (cfgIndex + 1))){
    var cfgPath = process.argv[cfgIndex + 1];
} else {
    var cfgPath = __dirname + '/cfg.json';
}

var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

cfg.servers.forEach(function(server){
    if(server.type === "rtu")server.client = new RtuClient(server);
    if(server.type === "tcp")server.client = new TcpClient(server);
});


//var rtuClient = new RtuClient({host:'192.168.0.134', port:4001});

//var tcpServer = new TcpServer({listenOptions:cfg.listen}, processRequest);

cfg.listen.forEach(function(listen){
    if(listen.type === "rtu")listen.server = new RtuServer({listenOptions:listen}, processRequest);
    if(listen.type === "tcp")listen.server = new TcpServer({listenOptions:listen}, processRequest);
});

function processRequest(request, callback) {

    if(typeof callback !== "function") return;

    var slave = request[0];
    var server = cfg.servers.find(function(server){
        return (slave >= server.slaveMin) && (slave <= server.slaveMax);
    });

    if(server && server.client){
        request[0] += server.offset;
        server.client.request(request, function(response){
            response[0] =  slave;
            callback(response);
        });
    } else {
        callback(new Buffer([request[0], request[1] + 0x80, 10])); //Return exception path unavailable
    }

}