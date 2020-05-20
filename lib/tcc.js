// var request = require('request');
var Queue = require('better-queue');
const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var debug = require('debug')('tcc-lib');

// var jar = request.jar(); // Store cookies

var devices = {};

const URL = 'https://tccna.honeywell.com/ws/MobileV2.asmx';

var HEADER = {
  'user-agent': 'TCCStageC/1092 CFNetwork/1125.2 Darwin/19.4.0',
  'Content-Type': 'text/xml;charset=UTF-8',
  'ADRUM': 'isAjax:true',
  'Accept': '*/*',
  'Accept-Language': 'en-ca',
  'Accept-Encoding': 'gzip, deflate, br',
  'ADRUM_1': 'isMobile:true'
};

var messageQueue = new Queue(function(options, cb) {
  // debug("Queue", messageQueue.getStats());
  soapRequest(options, cb);
}, {
  concurrent: 1,
  autoResume: true,
  maxRetries: 0
});

module.exports = {
  tcc: tcc
};

function tcc(options, callback) {
  debug("Setting up TCC component");
  this._username = options.username;
  this._password = options.password;
  this._refresh = options.refresh;
  this.sessionID = null;
  this.devices = {};
  pollDevices.call(this, function(err, result) {
    if (!err) {
      // debug("initial", result);
      devices = result;
      callback(null, result);
    } else {
      // debug("inital Error", err);
      callback(err);
    }
  });
}

tcc.prototype = {
  getDevices: function() {
    return devices;
  }
};

tcc.prototype.poll = function(callback) {
  // debug("poll", this);
  pollDevices.call(this, function(err, devices) {
    callback(err, devices);
  });
};

async function pollDevices(callback) {
  debug("pollDevices");
  try {
    if (!this.sessionID) {
      this.sessionID = await _login.call(this, devices);
    }
    devices = await _GetLocationListData.call(this, devices);
    debug("pollDevices - callback", devices.hb);
    callback(null, devices);
  } catch (err) {
    console.error("pollDevices Error:", err, devices);
    callback(err, devices);
  }
}

tcc.prototype.setTargetTemperature = function(accessory, value, callback) {
  debug("setTargetTemperature %s ===> ", accessory.displayName, value);
  callback(null, value);
};

tcc.prototype.setTargetHeatingCooling = function(accessory, value, callback) {
  debug("setTargetTemperature %s ===> ", accessory.displayName, value);
  callback(null, value);
};

function _login() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
        var AuthenticateUserLogin = {
          AuthenticateUserLogin: {
            username: {
              $t: this._username
            },
            password: {
              $t: this._password
            },
            applicationID: {
              $t: "357568d9-38ff-4fda-bfe2-46b0fa1dd864"
            },
            applicationVersion: {
              $t: "2"
            },
            uiLanguage: {
              $t: "Default"
            }
          }
        };
        // debug("SOAP Message", parser.toXml(soapMessage(AuthenticateUserLogin)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLogin)),
          timeout: 1000
        });
        if (response.statusCode === 200) {
          var AuthenticateUserLoginResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;
          if (AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result === "Success") {
            resolve(AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID);
          } else {
            debug("ERROR: Login Failed", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result);
            reject(new Error("ERROR: Login Failed", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result));
          }
        } else {
          reject(new Error("ERROR: Response Status Code", response.statusCode));
        }
      } catch (err) {
        console.error("login Error:", err, devices);
        reject(err);
      }
    })();
  });
}

function _GetLocationListData() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
        var GetLocations = {
          GetLocations: {
            sessionID: {
              $t: this.sessionID
            }
          }
        };
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetLocations)),
          timeout: 1000
        });
        if (response.statusCode === 200) {
          var GetLocationsResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;

          if (GetLocationsResult.Result === "Success") {
            // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
            resolve(normalizeToHb(GetLocationsResult.Locations));
          } else {
            reject(new Error("ERROR: GetLocations", GetLocationsResult.Result));
          }
        } else {
          reject(new Error("ERROR: Response Status Code", response.statusCode));
        }
      } catch (err) {
        console.error("GetLocations Error:", err, devices);
        reject(err);
      }
    })();
  });
}

function soapMessage(body) {
  return ({
    "soap:Envelope": {
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "xmlns": "http://services.alarmnet.com/Services/MobileV2/",
      "soap:Body": body
    }
  });
}

function normalizeToHb(devices) {
  // debug("normalizeToHb", devices.LocationInfo.Thermostats.ThermostatInfo, Array.isArray(devices.LocationInfo.Thermostats.ThermostatInfo));
  devices.hb = [];
  if (Array.isArray(devices.LocationInfo.Thermostats.ThermostatInfo)) {
    devices.LocationInfo.Thermostats.ThermostatInfo.forEach((item, i) => {
      devices.hb[item.ThermostatID] = toHb(item);
    });
  } else {
    devices.hb[devices.LocationInfo.Thermostats.ThermostatInfo.ThermostatID] = toHb(devices.LocationInfo.Thermostats.ThermostatInfo);
  }
  // debug("normalizeToHb", devices.hb);
  return devices;
}

function toHb(thermostat) {
  var response = {};

  response.CurrentTemperature = toCelcius(thermostat.UI.DispTemperature, thermostat);
  response.TargetTemperature = toCelcius(targetTemperature(thermostat), thermostat);
  response.CurrentHeatingCoolingState = currentState(thermostat);
  response.TargetHeatingCoolingState = thermostat.UI.SystemSwitchPosition;
  response.TargetHeatingCoolingStateValidValues = stateValidValues(thermostat);
  response.TargetTemperatureHeatMinValue = thermostat.UI.HeatLowerSetptLimit;
  response.TargetTemperatureHeatMaxValue = thermostat.UI.HeatUpperSetptLimit;
  response.TargetTemperatureCoolMinValue = thermostat.UI.CoolLowerSetptLimit;
  response.TargetTemperatureCoolMaxValue = thermostat.UI.CoolUpperSetptLimit;
  return response;
}

function toCelcius(value, thermostat) {
  return (thermostat.UI.DisplayedUnits === "C" ? value : (value * 9 / 5) + 32).toFixed(1);
}

function currentState(thermostat) {
  var response = 0;

  if (thermostat.UI.StatusHeat) {
    response = 1;
  } else if (thermostat.UI.StatusCool) {
    response = 2;
  }
  return response;
}

function stateValidValues(thermostat) {
  var response = [];
  if (thermostat.UI.CanSetSwitchOff) {
    response.push(0);
  }
  if (thermostat.UI.CanSetSwitchHeat) {
    response.push(1);
  }
  if (thermostat.UI.CanSetSwitchCool) {
    response.push(2);
  }
  if (thermostat.UI.CanSetSwitchAuto) {
    response.push(3);
  }
  return response;
}

function targetTemperature(thermostat) {
  var targetTemperature;
  switch (thermostat.UI.SystemSwitchPosition) {
    case 0: // Off
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
      break;
    case 1:
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 2:
      targetTemperature = thermostat.UI.CoolSetpoint;
      break;
    case 3:
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
      break;
    default:
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
  }

  return (targetTemperature);
}
