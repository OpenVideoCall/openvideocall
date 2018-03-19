"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Session_1 = require("./Session");
var Archive_1 = require("./Archive");
var https = require('https');
var OpenVidu = /** @class */ (function () {
    function OpenVidu(urlOpenViduServer, secret) {
        this.urlOpenViduServer = urlOpenViduServer;
        this.setHostnameAndPort();
        this.basicAuth = this.getBasicAuth(secret);
    }
    OpenVidu.prototype.createSession = function (properties) {
        return new Session_1.Session(this.hostname, this.port, this.basicAuth, properties);
    };
    OpenVidu.prototype.startRecording = function (sessionId) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var requestBody = JSON.stringify({
                'session': sessionId
            });
            var options = {
                hostname: _this.hostname,
                port: _this.port,
                path: OpenVidu.API_RECORDINGS + OpenVidu.API_RECORDINGS_START,
                method: 'POST',
                headers: {
                    'Authorization': _this.basicAuth,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                }
            };
            var req = https.request(options, function (res) {
                var body = '';
                res.on('data', function (d) {
                    // Continuously update stream with data
                    body += d;
                });
                res.on('end', function () {
                    if (res.statusCode === 200) {
                        // SUCCESS response from openvidu-server (Archive in JSON format). Resolve new Archive
                        resolve(new Archive_1.Archive(JSON.parse(body)));
                    }
                    else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.statusCode));
                    }
                });
            });
            req.on('error', function (e) {
                reject(new Error(e));
            });
            req.write(requestBody);
            req.end();
        });
    };
    OpenVidu.prototype.stopRecording = function (recordingId) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var options = {
                hostname: _this.hostname,
                port: _this.port,
                path: OpenVidu.API_RECORDINGS + OpenVidu.API_RECORDINGS_STOP + '/' + recordingId,
                method: 'POST',
                headers: {
                    'Authorization': _this.basicAuth,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            var req = https.request(options, function (res) {
                var body = '';
                res.on('data', function (d) {
                    // Continuously update stream with data
                    body += d;
                });
                res.on('end', function () {
                    if (res.statusCode === 200) {
                        // SUCCESS response from openvidu-server (Archive in JSON format). Resolve new Archive
                        resolve(new Archive_1.Archive(JSON.parse(body)));
                    }
                    else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.statusCode));
                    }
                });
            });
            req.on('error', function (e) {
                reject(new Error(e));
            });
            //req.write();
            req.end();
        });
    };
    OpenVidu.prototype.getRecording = function (recordingId) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var options = {
                hostname: _this.hostname,
                port: _this.port,
                path: OpenVidu.API_RECORDINGS + '/' + recordingId,
                method: 'GET',
                headers: {
                    'Authorization': _this.basicAuth,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            var req = https.request(options, function (res) {
                var body = '';
                res.on('data', function (d) {
                    // Continuously update stream with data
                    body += d;
                });
                res.on('end', function () {
                    if (res.statusCode === 200) {
                        // SUCCESS response from openvidu-server (Archive in JSON format). Resolve new Archive
                        resolve(new Archive_1.Archive(JSON.parse(body)));
                    }
                    else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.statusCode));
                    }
                });
            });
            req.on('error', function (e) {
                reject(new Error(e));
            });
            //req.write();
            req.end();
        });
    };
    OpenVidu.prototype.listRecordings = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var options = {
                hostname: _this.hostname,
                port: _this.port,
                path: OpenVidu.API_RECORDINGS,
                method: 'GET',
                headers: {
                    'Authorization': _this.basicAuth,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            var req = https.request(options, function (res) {
                var body = '';
                res.on('data', function (d) {
                    // Continuously update stream with data
                    body += d;
                });
                res.on('end', function () {
                    if (res.statusCode === 200) {
                        // SUCCESS response from openvidu-server (JSON arrays of Archives in JSON format). Resolve list of new Archives
                        var archiveArray = [];
                        var responseItems = JSON.parse(body)['items'];
                        for (var i = 0; i < responseItems.length; i++) {
                            archiveArray.push(new Archive_1.Archive(responseItems[i]));
                        }
                        resolve(archiveArray);
                    }
                    else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.statusCode));
                    }
                });
            });
            req.on('error', function (e) {
                reject(new Error(e));
            });
            //req.write();
            req.end();
        });
    };
    OpenVidu.prototype.deleteRecording = function (recordingId) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var options = {
                hostname: _this.hostname,
                port: _this.port,
                path: OpenVidu.API_RECORDINGS + '/' + recordingId,
                method: 'DELETE',
                headers: {
                    'Authorization': _this.basicAuth,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            var req = https.request(options, function (res) {
                var body = '';
                res.on('data', function (d) {
                    // Continuously update stream with data
                    body += d;
                });
                res.on('end', function () {
                    if (res.statusCode === 204) {
                        // SUCCESS response from openvidu-server. Resolve undefined
                        resolve(undefined);
                    }
                    else {
                        // ERROR response from openvidu-server. Resolve HTTP status
                        reject(new Error(res.statusCode));
                    }
                });
            });
            req.on('error', function (e) {
                reject(new Error(e));
            });
            //req.write();
            req.end();
        });
    };
    OpenVidu.prototype.getBasicAuth = function (secret) {
        return 'Basic ' + (new Buffer('OPENVIDUAPP:' + secret).toString('base64'));
    };
    OpenVidu.prototype.setHostnameAndPort = function () {
        var urlSplitted = this.urlOpenViduServer.split(':');
        if (urlSplitted.length === 3) {
            this.hostname = this.urlOpenViduServer.split(':')[1].replace(/\//g, '');
            this.port = parseInt(this.urlOpenViduServer.split(':')[2].replace(/\//g, ''));
        }
        else if (urlSplitted.length == 2) {
            this.hostname = this.urlOpenViduServer.split(':')[0].replace(/\//g, '');
            this.port = parseInt(this.urlOpenViduServer.split(':')[1].replace(/\//g, ''));
        }
        else {
            console.error("URL format incorrect: it must contain hostname and port (current value: '" + this.urlOpenViduServer + "')");
        }
    };
    OpenVidu.API_RECORDINGS = '/api/recordings';
    OpenVidu.API_RECORDINGS_START = '/start';
    OpenVidu.API_RECORDINGS_STOP = '/stop';
    return OpenVidu;
}());
exports.OpenVidu = OpenVidu;
//# sourceMappingURL=OpenVidu.js.map