"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var OpenViduRole_1 = require("./OpenViduRole");
var SessionProperties_1 = require("./SessionProperties");
var https = require('https');
var Session = /** @class */ (function () {
    function Session(hostname, port, basicAuth, properties) {
        this.hostname = hostname;
        this.port = port;
        this.basicAuth = basicAuth;
        this.sessionId = "";
        if (properties == null) {
            this.properties = new SessionProperties_1.SessionProperties.Builder().build();
        }
        else {
            this.properties = properties;
        }
    }
    Session.prototype.getSessionId = function (callback) {
        var _this = this;
        if (this.sessionId) {
            callback(this.sessionId);
            return;
        }
        var requestBody = JSON.stringify({
            'archiveLayout': this.properties.archiveLayout(),
            'archiveMode': this.properties.archiveMode(),
            'mediaMode': this.properties.mediaMode()
        });
        var options = {
            hostname: this.hostname,
            port: this.port,
            path: Session.API_SESSIONS,
            method: 'POST',
            headers: {
                'Authorization': this.basicAuth,
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
                    // SUCCESS response from openvidu-server. Resolve sessionId
                    var parsed = JSON.parse(body);
                    _this.sessionId = parsed.id;
                    callback(parsed.id);
                }
                else {
                    // ERROR response from openvidu-server. Resolve HTTP status
                    console.error(res.statusCode);
                }
            });
        });
        req.on('error', function (e) {
            console.error(e);
        });
        req.write(requestBody);
        req.end();
    };
    Session.prototype.generateToken = function (tokenOptions, callback) {
        var requestBody;
        if (callback) {
            requestBody = JSON.stringify({
                'session': this.sessionId,
                'role': tokenOptions.getRole(),
                'data': tokenOptions.getData()
            });
        }
        else {
            requestBody = JSON.stringify({
                'session': this.sessionId,
                'role': OpenViduRole_1.OpenViduRole.PUBLISHER,
                'data': ''
            });
            callback = tokenOptions;
        }
        var options = {
            hostname: this.hostname,
            port: this.port,
            path: Session.API_TOKENS,
            method: 'POST',
            headers: {
                'Authorization': this.basicAuth,
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
                    // SUCCESS response from openvidu-server. Resolve token
                    var parsed = JSON.parse(body);
                    callback(parsed.id);
                }
                else {
                    // ERROR response from openvidu-server. Resolve HTTP status
                    console.error(res.statusCode);
                }
            });
        });
        req.on('error', function (e) {
            console.error(e);
        });
        req.write(requestBody);
        req.end();
    };
    Session.prototype.getProperties = function () {
        return this.properties;
    };
    Session.API_SESSIONS = '/api/sessions';
    Session.API_TOKENS = '/api/tokens';
    return Session;
}());
exports.Session = Session;
//# sourceMappingURL=Session.js.map