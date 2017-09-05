/*jslint node: true */
'use strict';

var Q = require('q');
var request = require('request');
var jar = request.jar();
var _ = require('lodash');
var Characteristic;
var debug = false;
var ldebug = false;   // debugging of login errors - too verbose

var sessionCredentials = {};

function Session(username, password, appId) {
    //  console.log(username, password, appId, json);
    //  this.sessionId = json.sessionId;
    //  this.userInfo = new UserInfo(json.userInfo);
    //  this.latestEulaAccepted = json.latestEulaAccepted;

    sessionCredentials[this.sessionId] = {
        username: username,
        password: password,
        appId: appId
    };
}

Session.prototype.CheckDataSession = function(deviceID, cb) {
    var utc_seconds = Date.now();

    var url = "https://mytotalconnectcomfort.com/portal/Device/CheckDataSession/" + deviceID + "?_=" + utc_seconds;

    this._request(url).then(function(json) {
        cb(null, json);
    }.bind(this)).fail(function(err) {
        console.log('CDS Failed:', err);
        cb(err);
    });

}

// {"DeviceID":1234567,"SystemSwitch":null,"HeatSetpoint":14,"CoolSetpoint":null,"HeatNextPeriod":null,"CoolNextPeriod"
// :null,"StatusHeat":1,"StatusCool":1,"FanMode":null}
// {"DeviceID":1234567,"SystemSwitch":null,"HeatSetpoint":20,"CoolSetpoint":null,"HeatNextPeriod":null,"CoolNextPeriod"
// :null,"StatusHeat":null,"StatusCool":null,"FanMode":null}

Session.prototype.setHeatCoolSetpoint = function(deviceId, heatSetPoint, coolSetPoint) {
    var deferred = Q.defer();
    var url = "https://mytotalconnectcomfort.com/portal/Device/SubmitControlScreenChanges";

    var body = JSON.stringify({
        "DeviceID": Number(deviceId),
        "SystemSwitch": null,
        "HeatSetpoint": heatSetPoint,
        "CoolSetpoint": coolSetPoint,
        "HeatNextPeriod": null,
        "CoolNextPeriod": null,
        "StatusHeat": 1,
        "StatusCool": 1,
        "FanMode": null
    });

    if (debug)
        console.log("setHeatCoolSetpoint", body);

    request({
        method: 'POST',
        url: url,
        jar: jar,
        timeout: 15000,
        strictSSL: false,
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'Keep-Alive',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json; charset=UTF-8',
            'DNT': 1,
            'Host': 'mytotalconnectcomfort.com',
            'Origin': 'https://mytotalconnectcomfort.com',
            'Referer': 'https://mytotalconnectcomfort.com/portal/Device/Control/' + deviceId,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: body
    }, function(err, response) {
        if (err || response.statusCode != 200 || response.statusMessage != "OK") {
            if (err) {
                console.log("Error: setHeatCoolSetpoint",err);
            } else {
                console.log("Error ", response.statusCode);
                deferred.reject("HTTP Error ", response.statusCode);
            }
            deferred.reject(new Error("Error: setHeatCoolSetpoint"));

        } else {
            var json;
            //    console.log(response.body);
            try {
                json = JSON.parse(response.body);
            } catch (ex) {
                //                console.error(ex);
                console.error(response.statusCode, response.statusMessage);
                console.error(response.body);
                //                console.error(response);
                deferred.reject(ex);
            }
            if (json) {
                deferred.resolve(json);
            }
        }
    });

    return deferred.promise;
}
Session.prototype.setSystemSwitch = function(deviceId, systemSwitch) {
    var deferred = Q.defer();
    var url = "https://mytotalconnectcomfort.com/portal/Device/SubmitControlScreenChanges";

    var body = JSON.stringify({
        "DeviceID": Number(deviceId),
        "SystemSwitch": Number(systemSwitch),
        "HeatSetpoint": null,
        "CoolSetpoint": null,
        "HeatNextPeriod": null,
        "CoolNextPeriod": null,
        "StatusHeat": null,
        "StatusCool": null,
        "FanMode": null
    });

    if (debug)
        console.log("setSystemSwitch", body);

    request({
        method: 'POST',
        url: url,
        jar: jar,
        strictSSL: false,
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'Keep-Alive',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json; charset=UTF-8',
            'DNT': 1,
            'Host': 'mytotalconnectcomfort.com',
            'Origin': 'https://mytotalconnectcomfort.com',
            'Referer': 'https://mytotalconnectcomfort.com/portal/Device/Control/' + deviceId,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: body
    }, function(err, response) {
        if (err || response.statusCode != 200 || response.statusMessage != "OK") {
            if (err) {
                console.error(err);
            } else {
                console.log("Error ", response.statusCode);
                deferred.reject("HTTP Error ", response.statusCode);
            }
            return err;

        } else {
            var json;
            //    console.log(response.body);
            try {
                json = JSON.parse(response.body);
            } catch (ex) {
                //                console.error(ex);
                console.error(response.statusCode, response.statusMessage);
                console.error(response.body);
                //                console.error(response);
                deferred.reject(ex);
            }
            if (json) {
                deferred.resolve(json);
            }
        }
    });

    return deferred.promise;
}

Session.prototype._request = function(url) {
    var deferred = Q.defer();
    request({
        method: 'GET',
        url: url,
        jar: jar,
        timeout: 15000,
        strictSSL: false,
        headers: {
            "Accept": "*/*",
            "DNT": "1",
            "Accept-Encoding": "plain",
            "Cache-Control": "max-age=0",
            "Accept-Language": "en-US,en,q=0.8",
            "Connection": "keep-alive",
            "Host": "mytotalconnectcomfort.com",
            "Referer": "https://mytotalconnectcomfort.com/portal/",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36"
        }
    }, function(err, response) {
        if (err || response.statusCode != 200 || response.statusMessage != "OK") {
            if (err) {
                console.log("Error _request", url, err);
                deferred.reject(err);
            } else {
                console.log("Error _request", url, response.statusCode);
                deferred.reject("HTTP Error " + response.statusCode);
            }
            return err;

        } else {
            var json;
            //console.log("_request", url, response.body);
            try {
                json = JSON.parse(response.body);
            } catch (ex) {
                //                console.error(ex);
                console.error(response.statusCode, response.statusMessage);
                console.error(response.body);
                //                console.error(response);
                deferred.reject(ex);
            }
            if (json) {
                deferred.resolve(json);
            }
        }
    });

    return deferred.promise;
}

function login(username, password) {
    var deferred = Q.defer();
    request({
        jar: jar,
        method: 'GET',
        url: 'https://mytotalconnectcomfort.com/portal/',
        timeout: 10000,
        strictSSL: false,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "sdch",
            "Host": "mytotalconnectcomfort.com",
            "DNT": "1",
            "Origin": "https://mytotalconnectcomfort.com/portal",
            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36"
        },

    }, function(err, response) {
        // Response s/b 200 OK
        if (err || response.statusCode != 200) {
            console.log("TCC Login Failed, can't connect to TCC Web Site", err);
            deferred.reject("TCC Login failed, can't connect to TCC Web Site");
            return err;
        } else {
            if (ldebug) {
                console.log(response.statusCode);
                console.log(response.statusMessage);
                console.log("-------------------------------------------");
                console.log(response.headers);
                console.log("-------------------------------------------");
                console.log(response.body);
                console.log("-------------------------------------------");
            }
            request({
                jar: jar,
                method: 'POST',
                url: 'https://mytotalconnectcomfort.com/portal/',
                timeout: 10000,
                strictSSL: false,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Encoding": "sdch",
                    "Host": "mytotalconnectcomfort.com",
                    "DNT": "1",
                    "Origin": "https://mytotalconnectcomfort.com/portal",
                    "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36"
                },
                form: {
                    UserName: username,
                    Password: password,
                    RememberMe: "false"
                        //		ApplicationId: appId
                }
            }, function(err, response) {
                // response s/b 302
                if (err || response.statusCode != 302) {
                    console.log("TCC Login Failed - POST", err);
                    if (response) console.log(response.statusCode);
                    deferred.reject("TCC Login failed, please check your credentials");
                    return err;

                } else {
                    if (ldebug) {
                        console.log(response.statusCode);
                        console.log(response.statusMessage);
                        console.log("-------------------------------------------");
                        console.log(response.headers);
                        console.log("-------------------------------------------");
                        console.log(response.body);
                        console.log("-------------------------------------------");
                    }
                    request({
                        jar: jar,
                        method: 'GET',
                        url: 'https://mytotalconnectcomfort.com/portal/',
                        timeout: 10000,
                        strictSSL: false,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Encoding": "sdch",
                            "Host": "mytotalconnectcomfort.com",
                            "DNT": "1",
                            "Origin": "https://mytotalconnectcomfort.com/portal",
                            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36"
                        },

                    }, function(err, response) {
                        if (err || response.statusCode != 200) {
                            console.log("TCC Login failed - GET", err);
                            if (response) console.log(response.statusCode);
                            deferred.reject("TCC Login failed - GET");

                            return err;
                        } else {
                            if (ldebug) {
                                console.log(response.statusCode);
                                console.log(response.statusMessage);
                                console.log("-------------------------------------------");
                                console.log(response.headers);
                                console.log("-------------------------------------------");
                                console.log(response.body);
                                console.log("-------------------------------------------");
                            }
                            deferred.resolve(response.statusCode);
                        }
                    });

                }
            });
        }
    });

    return deferred.promise;
}

module.exports = {
    login: function(username, password, appId) {
        return login(username, password, appId).then(function(json) {
            return new Session(username, password, appId, json);
        });
    }
};

// Utility Functions


module.exports.toTCCTemperature = function(that, temperature) {
    switch (that.device.latestData.uiData.DisplayUnits) {
        case "F":
            return ((temperature * 9 / 5) + 32).toFixed(1);
            break;
        default:
            return temperature;
    }

}

module.exports.toHBTemperature = function(that, temperature) {
    // homekit only deals with Celsius

    switch (that.device.latestData.uiData.DisplayUnits) {
        case "F":
            return ((temperature - 32) * 5 / 9).toFixed(1);
            break;
        default:
            return temperature;
    }

}

module.exports.toHomeBridgeHeatingCoolingSystem = function(heatingCoolingSystem) {
    switch (heatingCoolingSystem) {
        case 1:
            // heat
            return Characteristic.TargetHeatingCoolingState.HEAT;
            break;
        case 2:
            // off
            return Characteristic.TargetHeatingCoolingState.OFF;
            break;
        case 3:
            // cool
            return Characteristic.TargetHeatingCoolingState.COOL;
            break;
        case 4:
            // auto
            return Characteristic.TargetHeatingCoolingState.AUTO;
            break;
        default:
            return Characteristic.TargetHeatingCoolingState.OFF;
    }
}

module.exports.toTCCHeadingCoolingSystem = function(heatingCoolingSystem) {
    switch (heatingCoolingSystem) {
        case Characteristic.TargetHeatingCoolingState.OFF:
            // off
            return 2;
            break;
        case Characteristic.TargetHeatingCoolingState.HEAT:
            // heat
            return 1
            break;
        case Characteristic.TargetHeatingCoolingState.COOL:
            // cool
            return 3
            break;
        case Characteristic.TargetHeatingCoolingState.AUTO:
            // auto
            return 4
            break;
        default:
            return 0;
    }
}

module.exports.isEmptyObject = function(obj) {
    var name;
    for (name in obj) {
        return false;
    }
    return true;
};

module.exports.diff = function(obj1, obj2) {
    var result = {};
    var change;
    for (var key in obj1) {
        if (typeof obj2[key] == 'object' && typeof obj1[key] == 'object') {
            change = module.exports.diff(obj1[key], obj2[key]);
            if (module.exports.isEmptyObject(change) === false) {
                result[key] = change;
            }
        } else if (obj2[key] != obj1[key]) {
            result[key] = obj2[key];
        }
    }
    return result;
};

module.exports.deepEquals = function(o1, o2) {
    return JSON.stringify(o1) === JSON.stringify(o2);
}

module.exports.setCharacteristic = function(data) {
    Characteristic = data;
}

module.exports.setDebug = function(data) {
    debug = data;
}
