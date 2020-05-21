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
    // debug("pollDevices - callback", devices.LocationInfo.Thermostats.ThermostatInfo);
    callback(null, devices);
  } catch (err) {
    console.error("pollDevices Error:", err, devices);
    callback(err, devices);
  }
}

tcc.prototype.setTargetTemperature = function(accessory, value, callback) {
  debug("setTargetTemperature %s ===> ", accessory.displayName, value);
  debug("this", this);
  debug("accessory", accessory);
  callback(null, value);
};

tcc.prototype.setTargetHeatingCooling = function(accessory, value, callback) {
  debug("setTargetHeatingCooling %s ===> ", accessory.displayName, value);
  debug("Context", accessory.context);
  (async () => {
    try {
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      var soapBody = {
        "ChangeThermostatUI": {
          "sessionID": {
            "$t": this.sessionID
          },
          "thermostatID": {
            "$t": accessory.context.ThermostatID
          },
          "changeSystemSwitch": {
            "$t": 1
          },
          "systemSwitch": {
            "$t": systemSwitch(value)
          },
          "changeHeatSetpoint": {
            "$t": 1
          },
          "heatSetpoint": {
            "$t": accessory.context.device.UI.HeatSetpoint
          },
          "changeCoolSetpoint": {
            "$t": 1
          },
          "coolSetpoint": {
            "$t": accessory.context.device.UI.CoolSetpoint
          },
          "changeHeatNextPeriod": {
            "$t": 1
          },
          "heatNextPeriod": {
            "$t": accessory.context.device.UI.HeatNextPeriod
          },
          "changeCoolNextPeriod": {
            "$t": 1
          },
          "coolNextPeriod": {
            "$t": accessory.context.device.UI.CoolNextPeriod
          },
          "changeStatusHeat": {
            "$t": 1
          },
          "statusHeat": {
            "$t": accessory.context.device.UI.StatusHeat
          },
          "changeStatusCool": {
            "$t": 1
          },
          "statusCool": {
            "$t": accessory.context.device.UI.StatusCool
          }
        }
      };
      // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(soapBody)),
        timeout: 1000
      });
      if (response.statusCode === 200) {
        var setTargetHeatingCooling = parser.toJson(response.body, {
          object: true,
          reversible: false,
          coerce: true,
          sanitize: false,
          trim: true,
          arrayNotation: false,
          alternateTextNode: false
        })["soap:Envelope"]["soap:Body"];
        debug("setTargetHeatingCooling", setTargetHeatingCooling);
        if (setTargetHeatingCooling.Result === "Success") {
          // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
          callback(null, value);
        } else {
          this.sessionID = null;
          callback(new Error("ERROR: setTargetHeatingCooling", setTargetHeatingCooling.Result));
        }
      } else {
        callback(new Error("ERROR: Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setTargetHeatingCooling Error:", err, devices);
      callback(err);
    }
  })();
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
            this.sessionID = null;
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
  response.TargetHeatingCoolingState = targetState(thermostat);
  response.TargetHeatingCoolingStateValidValues = stateValidValues(thermostat);
  response.TargetTemperatureHeatMinValue = thermostat.UI.HeatLowerSetptLimit;
  response.TargetTemperatureHeatMaxValue = thermostat.UI.HeatUpperSetptLimit;
  response.TargetTemperatureCoolMinValue = thermostat.UI.CoolLowerSetptLimit;
  response.TargetTemperatureCoolMaxValue = thermostat.UI.CoolUpperSetptLimit;
  response.device = thermostat;
  return response;
}

function toCelcius(value, thermostat) {
  return (thermostat.UI.DisplayedUnits === "C" ? value : (value * 9 / 5) + 32).toFixed(1);
}

function currentState(thermostat) {
  var state;

  switch (thermostat.EquipmentStatus) {
    case "Off": // Off
      state = 0;
      break;
    case "Heat": // Off
      state = 1;
      break;
    case "Cool": // Off
      state = 2;
      break;
  }
  return state;
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

function targetState(thermostat) {
  // TCC to HomeKit
  var state;
  switch (thermostat.UI.SystemSwitchPosition) {
    case 2: // Off
      state = 0;
      break;
    case 1: // Heat
      state = 1;
      break;
    case 3: // Cool
      state = 2;
      break;
    case 4: // Auto
      state = 3;
      break;
    default:
      state = 0;
  }

  return (state);
}

function systemSwitch(value) {
  // HomeKit to TCC
  var state;
  switch (value) {
    case 0: // Off
      state = 2;
      break;
    case 1: // Heat
      state = 1;
      break;
    case 2: // Cool
      state = 3;
      break;
    case 3: // Auto
      state = 4;
      break;
    default:
      state = 0;
  }

  return (state);
}

function targetTemperature(thermostat) {
  var targetTemperature;
  switch (thermostat.UI.SystemSwitchPosition) {
    case 2: // Off
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
      break;
    case 1:
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 3:
      targetTemperature = thermostat.UI.CoolSetpoint;
      break;
    case 4:
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
      break;
    default:
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
  }

  return (targetTemperature);
}
