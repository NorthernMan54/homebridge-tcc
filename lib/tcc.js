var Q = require('q');
var request = require('request');
var jar = request.jar();
var _ = require('lodash');

function UserInfo(json) {
    this.userID = json.userID;
    this.username = json.username;
    this.firstname = json.firstname;
    this.lastname = json.lastname;
    this.streetAddress = json.streetAddress;
    this.city = json.city;
    this.state = json.state;
    this.zipcode = json.zipcode;
    this.country = json.country;
    this.telephone = json.telephone;
    this.userLanguage = json.userLanguage;
    this.isActivated = json.isActivated;
    this.deviceCount = json.deviceCount;
}

// Private
var sessionCredentials = {};

function Session(username, password, appId, json) {
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

function Location(json) {
    //    console.log("Location");
    //    console.log(json);
    this.success = json.success;
    this.deviceLive = json.deviceLive;
    this.communicationLost = json.communicationLost;
    this.latestData = json.latestData;
    this.uiData = json.uiData;
    this.fanData = json.fanData;
    this.hasFan = json.hasFan;
    this.tycanControlHumidificationpe = json.canControlHumidification;
    this.devices = _.map(json.devices, function(device) {
        return new Device(device);
    });
    this.drData = json.drData;
    this.daylightSavingTimeEnabled = json.daylightSavingTimeEnabled;
    this.timeZone = json.timeZone;
    this.oneTouchActionsSuspended = json.oneTouchActionsSuspended;
    this.evoTouchSystemsStatus = json.evoTouchSystemsStatus;
    this.isLocationOwner = json.isLocationOwner;
    this.locationOwnerName = json.locationOwnerName;
    //    console.log( this );
}

function Device(json) {
    this.deviceID = json.deviceID;
    this.thermostatModelType = json.thermostatModelType;
    this.name = json.name;
    this.thermostat = new Thermostat(json.thermostat);
}

function Thermostat(json) {
    this.units = json.units;
    this.indoorTemperature = json.indoorTemperature;
    this.outdoorTemperature = json.outdoorTemperature;
    this.allowedModes = json.allowedModes;
    this.deadband = json.deadband;
    this.minHeatSetpoint = json.minHeatSetpoint;
    this.maxHeatSetpoint = json.maxHeatSetpoint;
    this.minCoolSetpoint = json.minCoolSetpoint;
    this.maxCoolSetpoint = json.maxCoolSetpoint;
    this.changeableValues = json.changeableValues;

}

Session.prototype.getLocations = function() {
    var url = "https://tccna.honeywell.com/WebAPI/api/locations?userId=" + this.userInfo.userID + "&allData=True";
    return this._request(url).then(function(json) {
        return JSON.parse(json);
    });
}

Session.prototype.CheckDataSession = function(deviceID) {
    utc_seconds = Date.now();

    var url = "https://mytotalconnectcomfort.com/portal/Device/CheckDataSession/" + deviceID + "?_=" + utc_seconds;
    return this._request(url).then(function(json) {
    //    console.log( json);
    //    console.log( json.latestData.uiData.DispTemperature);
    //    deferred.resolve(json);
      return json;
    });
}

Session.prototype.setHeatSetpoint = function(deviceId, targetTemperature, minutes) {
    var deferred = Q.defer();
    var url = "https://mytotalconnectcomfort.com/portal/Device/SubmitControlScreenChanges";
    var now = new Date();
    var timezoneOffsetInMinutes = now.getTimezoneOffset();

    var endDate = new Date(now);
    endDate.setMinutes(endDate.getMinutes() - timezoneOffsetInMinutes + minutes);
    endDate.setSeconds(0);
    endDate.setMilliseconds(0);

    var body = JSON.stringify({
        "DeviceID": Number(deviceId),
        "SystemSwitch": null,
        "HeatSetpoint": targetTemperature,
        "CoolSetpoint": null,
        "HeatNextPeriod": null,
        "CoolNextPeriod": null,
        "StatusHeat": null,
        "StatusCool": null,
        "FanMode": null
    });

    request({
        method: 'POST',
        url: url,
        jar: jar,
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
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(JSON.parse(response.body));
        }
    });
    return deferred.promise;
}

Session.prototype.setSystemSwitch = function (deviceId, systemSwitch) {
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

    request({
        method: 'POST',
        url: url,
        jar: jar,
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
    }, function (err, response) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(JSON.parse(response.body));
        }
    });
    return deferred.promise;
}

Session.prototype._renew = function() {
    var self = this;
    var credentials = sessionCredentials[this.sessionID];
    return login(credentials.username, credentials.password, credentials.appId).then(function(json) {
        self.sessionId = json.sessionId;
        self.userInfo = new UserInfo(json.userInfo);
        self.latestEulaAccepted = json.latestEulaAccepted;
        return self;
    });
}

Session.prototype._request = function(url) {
    var deferred = Q.defer();
    request({
        method: 'GET',
        url: url,
        jar: jar,
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
        if (err) {
            deferred.reject(err);
        } else {
            var json;
            //    console.log(response.body);
            try {
                json = JSON.parse(response.body);
            } catch (ex) {
                console.error(ex);
                console.error(response.body);
                console.error(response);
                deferred.reject(ex);
            }
            if (json) {
                deferred.resolve(json);
            }
        }
    });

    return deferred.promise;
}

function login(username, password, deviceId) {
    var deferred = Q.defer();
    request({
        jar: jar,
        method: 'GET',
        url: 'https://mytotalconnectcomfort.com/portal/',
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
        if (err) {
            return err;
        } else {
        //    console.log(response.statusCode);
        //    console.log(response.headers);
            //console.log(response.body);
        //    console.log("-------------------------------------------");
            request({
                jar: jar,
                method: 'POST',
                url: 'https://mytotalconnectcomfort.com/portal/',
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
                if (err) {
                    return err;
                } else {
                  //  console.log(response.statusCode);
                  //  console.log(response.headers);
                    //console.log(response.body);
                  //  console.log("-------------------------------------------");
                    request({
                        jar: jar,
                        method: 'GET',
                        url: 'https://mytotalconnectcomfort.com/portal/',
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
                        if (err) {
                            return err;
                        } else {

                          //  console.log(response.statusCode);
                          //  console.log(response.headers);
                          //  console.log(response.body);
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
