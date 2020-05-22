// var request = require('request');
var Queue = require('better-queue');
const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var debug = require('debug')('tcc-lib');

// var jar = request.jar(); // Store cookies

var thermostats = {};

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
  pollDevices.call(this, function(err, result) {
    if (!err) {
      // debug("initial", result);
      thermostats = result;
      // debug("Login", thermostats.LocationInfo.Thermostats.ThermostatInfo);
      callback(null, result);
    } else {
      // debug("inital Error", err);
      callback(err);
    }
  });
}

tcc.prototype.poll = function(callback) {
  // debug("poll", this);
  pollDevices.call(this, function(err, devices) {
    callback(err, devices);
  });
};

async function pollDevices(callback) {
  // debug("pollDevices");
  try {
    if (!this.sessionID) {
      this.sessionID = await _login.call(this);
      debug("TCC - Login Succeeded");
    }
    var current = await _GetLocationListData.call(this);
    if (thermostats.LocationInfo && current.LocationInfo) {
      debug("pollDevices - callback", diff(thermostats, current));
    }
    thermostats = current;
    callback(null, thermostats);
  } catch (err) {
    console.error("pollDevices Error:", err);
    callback(err, thermostats);
  }
}

tcc.prototype.setTargetTemperature = function(accessory, value, callback) {
  debug("setTargetTemperature %s ===> ", accessory.displayName, value);
  (async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await _login.call(this);
      }
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      // debug("SOAP Message", parser.toXml(soapMessage(ChangeThermostatUI(accessory, value))));
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))),
        timeout: 1000,
        withCredentials: true
      });
      if (response.statusCode === 200) {
        var setTargetTemperature = parser.toJson(response.body, {
          object: true,
          reversible: false,
          coerce: true,
          sanitize: false,
          trim: true,
          arrayNotation: false,
          alternateTextNode: false
        })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
        debug("setTargetTemperature", setTargetTemperature);
        // debug("setTargetTemperature - Error", setTargetTemperature.error);
        if (setTargetTemperature.Result === "Success") {
          // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
          debug("Success: setTargetTemperature %s\n", setTargetTemperature.Result, value, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
          callback(null, value);
        } else {
          this.sessionID = null;
          debug("ERROR: setTargetTemperature %s\n", setTargetTemperature.Result, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
          callback(new Error("ERROR: setTargetTemperature", setTargetTemperature.Result));
        }
      } else {
        debug("ERROR: setTargetTemperature %s\n", response, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
        callback(new Error("ERROR: setTargetTemperature Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setTargetTemperature Error:", err.message, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
      this.sessionID = null;
      callback(err);
    }
  })();
};

tcc.prototype.setTargetHeatingCooling = function(accessory, value, callback) {
  debug("setTargetHeatingCooling %s ===> ", accessory.displayName, value);
  (async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await _login.call(this);
      }
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      // debug("SOAP Message", parser.toXml(soapMessage(ChangeThermostatUI(accessory, value))));
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(TargetHeatingCooling.call(this, accessory, value))),
        timeout: 1000,
        withCredentials: true
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
        })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
        debug("setTargetHeatingCooling", setTargetHeatingCooling);
        // debug("setTargetHeatingCooling - Error", setTargetHeatingCooling.error);
        if (setTargetHeatingCooling.Result === "Success") {
          // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
          callback(null, value);
        } else {
          this.sessionID = null;
          debug("ERROR: setTargetHeatingCooling %s\n", setTargetHeatingCooling.Result, parser.toXml(soapMessage(ChangeThermostatUI.call(this, accessory, value))));
          callback(new Error("ERROR: setTargetHeatingCooling", setTargetHeatingCooling.Result));
        }
      } else {
        callback(new Error("ERROR: setTargetHeatingCooling Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setTargetHeatingCooling Error:", err.message);
      this.sessionID = null;
      callback(err);
    }
  })();
};

function _login() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLogin.call(this))),
          timeout: 1000,
          withCredentials: true
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
            debug("ERROR: Login Failed %s\n", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result, parser.toXml(soapMessage(AuthenticateUserLogin())));
            reject(new Error("ERROR: Login Failed"));
          }
        } else {
          reject(new Error("ERROR: Login Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
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
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetLocations.call(this))),
          timeout: 1000,
          withCredentials: true
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
            debug("ERROR: GetLocations %s\n", GetLocationsResult.Result, parser.toXml(soapMessage(GetLocations.call(this))));
            reject(new Error("ERROR: GetLocations", GetLocationsResult.Result));
          }
        } else {
          reject(new Error("ERROR: GetLocations Response Status Code", response.statusCode));
        }
      } catch (err) {
        console.error("GetLocations Error:", err.message);
        this.sessionID = null;
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
  // response.device = thermostat;
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
    case "Heating": // Off
      state = 1;
      break;
    case "Cooling": // Off
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

function getThermostat(accessory) {
  if (Array.isArray(thermostats.LocationInfo.Thermostats.ThermostatInfo)) {
    return (thermostats.LocationInfo.Thermostats.ThermostatInfo[accessory.context.ThermostatID]);
  } else {
    return (thermostats.LocationInfo.Thermostats.ThermostatInfo);
  }
}

function ChangeThermostatTemp(accessory, value) {
  // debug("ChangeThermostatTemp", getThermostat(accessory));
  var HeatSetpoint = getThermostat(accessory).UI.HeatSetpoint;
  var CoolSetpoint = getThermostat(accessory).UI.CoolSetpoint;

  var StatusHeat = getThermostat(accessory).UI.StatusHeat;
  var StatusCool = getThermostat(accessory).UI.StatusCool;

  switch (getThermostat(accessory).UI.SystemSwitchPosition) {
    case 1: // TCC Heat
      HeatSetpoint = value;
      if (this.usePermanentHolds)
        StatusHeat = 2;
      break;
    case 2: // TCC Off
      break;
    case 3: // TCC Cool
      CoolSetpoint = value;
      if (this.usePermanentHolds)
        StatusCool = 2;
      break;
    case 4: // TCC Auto
      if (value < getThermostat(accessory).UI.HeatNextPeriod) {
        HeatSetpoint = value;
        if (this.usePermanentHolds)
          StatusHeat = 2;
      } else if (value > getThermostat(accessory).UI.CoolSetpoint) {
        CoolSetpoint = value;
        if (this.usePermanentHolds)
          StatusCool = 2;
      } else if ((getThermostat(accessory).UI.HeatSetpoint - value) < (value - getThermostat(accessory).UI.CoolSetpoint)) {
        CoolSetpoint = value;
        if (this.usePermanentHolds)
          StatusCool = 2;
      } else {
        HeatSetpoint = value;
        if (this.usePermanentHolds)
          StatusHeat = 2;
      }
      break;
  }
  return ({
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
        "$t": getThermostat(accessory).UI.SystemSwitchPosition
      },
      "changeHeatSetpoint": {
        "$t": 1
      },
      "heatSetpoint": {
        "$t": HeatSetpoint
      },
      "changeCoolSetpoint": {
        "$t": 1
      },
      "coolSetpoint": {
        "$t": CoolSetpoint
      },
      "changeHeatNextPeriod": {
        "$t": 1
      },
      "heatNextPeriod": {
        "$t": getThermostat(accessory).UI.HeatNextPeriod
      },
      "changeCoolNextPeriod": {
        "$t": 1
      },
      "coolNextPeriod": {
        "$t": getThermostat(accessory).UI.CoolNextPeriod
      },
      "changeStatusHeat": {
        "$t": 1
      },
      "statusHeat": {
        "$t": StatusHeat
      },
      "changeStatusCool": {
        "$t": 1
      },
      "statusCool": {
        "$t": StatusCool
      }
    }
  });
}

function TargetHeatingCooling(accessory, value) {
  return ({
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
        "$t": getThermostat(accessory).UI.HeatSetpoint
      },
      "changeCoolSetpoint": {
        "$t": 1
      },
      "coolSetpoint": {
        "$t": getThermostat(accessory).UI.CoolSetpoint
      },
      "changeHeatNextPeriod": {
        "$t": 1
      },
      "heatNextPeriod": {
        "$t": getThermostat(accessory).UI.HeatNextPeriod
      },
      "changeCoolNextPeriod": {
        "$t": 1
      },
      "coolNextPeriod": {
        "$t": getThermostat(accessory).UI.CoolNextPeriod
      },
      "changeStatusHeat": {
        "$t": 1
      },
      "statusHeat": {
        "$t": getThermostat(accessory).UI.StatusHeat
      },
      "changeStatusCool": {
        "$t": 1
      },
      "statusCool": {
        "$t": getThermostat(accessory).UI.StatusCool
      }
    }
  });
}

function AuthenticateUserLogin() {
  return ({
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
  });
}

function GetLocations() {
  return ({
    GetLocations: {
      sessionID: {
        $t: this.sessionID
      }
    }
  });
}

function diff(obj1, obj2) {
  var result = {};
  var change;
  for (var key in obj1) {
    if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
      change = diff(obj1[key], obj2[key]);
      if (isEmptyObject(change) === false) {
        result[key] = change;
      }
    } else if (obj2[key] !== obj1[key]) {
      result[key] = obj2[key];
    }
  }
  return result;
}

function isEmptyObject(obj) {
  var name;
  for (name in obj) {
    return false;
  }
  return true;
}
