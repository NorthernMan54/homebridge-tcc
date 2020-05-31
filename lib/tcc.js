const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var debug = require('debug')('tcc-lib');

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

module.exports = {
  tcc: tcc
};

function tcc(options, callback) {
  debug("Setting up TCC component");
  this._username = options.username;
  this._password = options.password;
  this._refresh = options.refresh;
  this.sessionID = null;
  this.usePermanentHolds = options.usePermanentHolds;
  this.desiredState = {};
  this.deferrals = [];
  this.updating = false;
  this.waitTimeUpdate = 100;
  pollThermostat.call(this, function(err, result) {
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
  pollThermostat.call(this, function(err, devices) {
    callback(err, devices);
  });
};

async function pollThermostat(callback) {
  // debug("pollThermostat");
  try {
    if (!this.sessionID) {
      this.sessionID = await _login.call(this);
      debug("TCC - Login Succeeded");
    }
    var current = await _GetLocationListData.call(this);
    if (thermostats.LocationInfo && current.LocationInfo) {
      debug("pollThermostat - delta", JSON.stringify(diff(thermostats, current), null, 2));
    }
    thermostats = current;
    callback(null, thermostats);
  } catch (err) {
    console.error("pollThermostat Error:", err.message);
    debug("pollThermostat Error:", err);
    callback(err, thermostats);
  }
}

tcc.prototype.ChangeThermostat = function(accessory, state) {
  return new Promise((resolve, reject) => {
    for (const key in state) {
      // console.log("ChangeThermostat", accessory);
      this.desiredState.ThermostatID = accessory.context.ThermostatID;
      this.desiredState[key] = state[key];
    }
    const d = {
      resolve: resolve,
      reject: reject
    };
    this.deferrals.push(d);
    if (this.updating) {
      return;
    }
    this.updating = true;
    if (this.waitTimeUpdate > 0) {
      setTimeout(() => {
        this._put();
      }, this.waitTimeUpdate);
    } else {
      this._put();
    }
  });
};

tcc.prototype._put = function() {
  const desiredState = this.desiredState;
  const deferrals = this.deferrals;
  this.desiredState = {};
  this.deferrals = [];
  this.updating = false;
  debug("_put()", desiredState);
  (async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await _login.call(this);
      }
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(thermostatMessage.call(this, desiredState)));
      debug("SOAP Message", message);
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: message,
        timeout: 3000,
        withCredentials: true
      });
      if (response.statusCode === 200) {
        var ChangeThermostat = parser.toJson(response.body, {
          object: true,
          reversible: false,
          coerce: true,
          sanitize: false,
          trim: true,
          arrayNotation: false,
          alternateTextNode: false
        })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
        debug("_put", ChangeThermostat);
        if (ChangeThermostat.Result === "Success") {
          // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
          debug("Success: _put %s\n", ChangeThermostat);
          // , value, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
          this.recentlyUpdated = true;
          await _GetCommTaskState.call(this, ChangeThermostat.CommTaskID);
          await _GetThermostat.call(this, desiredState.thermostatID);
          for (const d of deferrals) {
            d.resolve(true);
          }
          setTimeout(() => {
            this.recentlyUpdated = false;
          }, 500);
        } else {
          this.sessionID = null;
          debug("ERROR: _put %s\n", ChangeThermostat.Result, message);
          for (const d of deferrals) {
            d.reject(new Error("ERROR: _put", ChangeThermostat.Result));
          }
        }
      } else {
        debug("ERROR: _put %s\n", response, message);
        for (const d of deferrals) {
          d.reject(new Error("ERROR: _put Response Status Code", response.statusCode));
        }
      }
    } catch (err) {
      console.error("_put Error:", err);
      this.sessionID = null;
      for (const d of deferrals) {
        d.reject(err);
      }
    }
  })();
};

tcc.prototype.setTargetTemperature = function(accessory, tempC, callback) {
  var value = toThermostat(tempC, accessory);
  debug("setTargetTemperature %s ===> %s (%s)", accessory.displayName, value, tempC);
  (async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await _login.call(this);
      }
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value)));
      // debug("SOAP Message", parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: message,
        timeout: 3000,
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
          debug("Success: setTargetTemperature %s\n", setTargetTemperature.Result);
          // , value, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
          callback(null, value);
        } else {
          this.sessionID = null;
          debug("ERROR: setTargetTemperature %s\n", setTargetTemperature.Result, message);
          callback(new Error("ERROR: setTargetTemperature", setTargetTemperature.Result));
        }
      } else {
        debug("ERROR: setTargetTemperature %s\n", response, message);
        callback(new Error("ERROR: setTargetTemperature Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setTargetTemperature Error:", err.message, parser.toXml(soapMessage(ChangeThermostatTemp.call(this, accessory, value))));
      this.sessionID = null;
      callback(err);
    }
  })();
};

tcc.prototype.setHeatCoolSetPoint = function(accessory, valueHeat, valueCool, callback) {
  debug("setHeatCoolSetPoint %s ===> heat: %s  cool: %s", accessory.displayName, valueHeat, valueCool);
  (async () => {
    try {
      if (!this.sessionID) {
        this.sessionID = await _login.call(this);
      }
      HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
      var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(ChangeThermostatSetpoint.call(this, accessory, valueHeat, valueCool)));
      debug("setHeatCoolSetPoint SOAP Message", message);
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: message,
        timeout: 3000,
        withCredentials: true
      });
      if (response.statusCode === 200) {
        var setHeatCoolSetPoint = parser.toJson(response.body, {
          object: true,
          reversible: false,
          coerce: true,
          sanitize: false,
          trim: true,
          arrayNotation: false,
          alternateTextNode: false
        })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
        debug("setHeatCoolSetPoint", setHeatCoolSetPoint);
        // debug("setHeatCoolSetPoint - Error", setHeatCoolSetPoint.error);
        if (setHeatCoolSetPoint.Result === "Success") {
          // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
          debug("Success: setHeatCoolSetPoint %s\n", setHeatCoolSetPoint.Result);
          // , value, parser.toXml(soapMessage(ChangeThermostatSetpoint.call(this, accessory, value))));
          callback(null, valueHeat, valueCool);
        } else {
          this.sessionID = null;
          debug("ERROR: setHeatCoolSetPoint %s\n", setHeatCoolSetPoint.Result, message);
          callback(new Error("ERROR: setHeatCoolSetPoint", setHeatCoolSetPoint.Result));
        }
      } else {
        debug("ERROR: setHeatCoolSetPoint %s\n", response, message);
        callback(new Error("ERROR: setHeatCoolSetPoint Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setHeatCoolSetPoint Error:", err.message, parser.toXml(soapMessage(ChangeThermostatSetpoint.call(this, accessory, valueHeat, valueCool))));
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
      var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(TargetHeatingCooling.call(this, accessory, value)));
      // debug("SOAP Message", parser.toXml(soapMessage(ChangeThermostatUI(accessory, value))));
      var {
        response
      } = await soapRequest({
        url: URL,
        headers: HEADER,
        xml: message,
        timeout: 3000,
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
          debug("ERROR: setTargetHeatingCooling %s\n", setTargetHeatingCooling.Result, message);
          callback(new Error("ERROR: setTargetHeatingCooling", setTargetHeatingCooling.Result));
        }
      } else {
        callback(new Error("ERROR: setTargetHeatingCooling Response Status Code", response.statusCode));
      }
    } catch (err) {
      console.error("setTargetHeatingCooling Error:", err);
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
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLogin.call(this)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: 3000,
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
            debug("ERROR: Login Failed %s\n", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result, message);
            reject(new Error("ERROR: Login Failed" + AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result));
          }
        } else {
          debug("ERROR: Login Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: Login Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
}

function _GetCommTaskState(commTaskID) {
  // SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetCommTaskState
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetCommTaskState';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(_GetCommTaskStateMessage.call(this, commTaskID)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: 3000,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var GetCommTaskStateResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetCommTaskStateResponse;
          if (GetCommTaskStateResponse.GetCommTaskStateResult.Result === "Success") {
            resolve();
          } else {
            debug("ERROR: GetCommTaskState Failed %s\n", GetCommTaskStateResponse.GetCommTaskStateResult.Result, message);
            reject(new Error("ERROR: GetCommTaskState Failed" + GetCommTaskStateResponse.GetCommTaskStateResult.Result));
          }
        } else {
          debug("ERROR: GetCommTaskState Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetCommTaskState Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
}

function _GetCommTaskStateMessage(commTaskID) {
  return ({
    GetCommTaskState: {
      sessionID: {
        $t: this.sessionID
      },
      commTaskID: {
        $t: commTaskID
      }
    }
  });
}

function _GetThermostat(thermostatID) {
  // SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetThermostat
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetThermostat';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(_GetThermostatMessage.call(this, thermostatID)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: 3000,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var GetThermostatResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetThermostatResponse.GetThermostatResult;
          debug("GetThermostatResult", GetThermostatResult);
          if (GetThermostatResult.Result === "Success") {
            resolve();
          } else {
            debug("ERROR: GetThermostat Failed %s\n", GetThermostatResult.Result, message);
            reject(new Error("ERROR: GetThermostat Failed" + GetThermostatResult.Result));
          }
        } else {
          debug("ERROR: GetThermostat Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetThermostat Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
}

function _GetThermostatMessage(thermostatID) {
  return ({
    GetThermostat: {
      sessionID: {
        $t: this.sessionID
      },
      thermostatID: {
        $t: thermostatID
      }
    }
  });
}

function _GetLocationListData() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetLocations.call(this)));
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: 3000,
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
            // debug("_GetLocationListData", JSON.stringify(GetLocationsResult.Locations, null, 2));
            resolve(normalizeToHb(GetLocationsResult.Locations));
          } else {
            this.sessionID = null;
            debug("ERROR: GetLocations %s\n", GetLocationsResult.Result, message);
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
      // debug("normalizeToHb", item.ThermostatID);
      devices.hb[item.ThermostatID] = toHb(item);
    });
  } else {
    devices.hb[devices.LocationInfo.Thermostats.ThermostatInfo.ThermostatID] = toHb(devices.LocationInfo.Thermostats.ThermostatInfo);
  }
  debug("normalizeToHb", devices.hb);
  return devices;
}

function toHb(thermostat) {
  var response = {};

  response.ThermostatID = thermostat.ThermostatID;
  response.DeviceName = thermostat.DeviceName;
  response.CurrentTemperature = toCelcius(thermostat.UI.DispTemperature, thermostat);
  response.TargetTemperature = toCelcius(targetTemperature(thermostat), thermostat);
  response.HeatingThresholdTemperature = toCelcius(thermostat.UI.HeatSetpoint, thermostat);
  response.CoolingThresholdTemperature = toCelcius(thermostat.UI.CoolSetpoint, thermostat);
  response.CurrentHeatingCoolingState = currentState(thermostat);
  response.TargetHeatingCoolingState = targetState(thermostat);
  response.TargetHeatingCoolingStateValidValues = stateValidValues(thermostat);
  response.TargetTemperatureHeatMinValue = toCelcius(thermostat.UI.HeatLowerSetptLimit, thermostat);
  response.TargetTemperatureHeatMaxValue = toCelcius(thermostat.UI.HeatUpperSetptLimit, thermostat);
  response.TargetTemperatureCoolMinValue = toCelcius(thermostat.UI.CoolLowerSetptLimit, thermostat);
  response.TargetTemperatureCoolMaxValue = toCelcius(thermostat.UI.CoolUpperSetptLimit, thermostat);
  // response.device = thermostat;
  return response;
}

function toCelcius(value, thermostat) {
  if (value) {
    return (thermostat.UI.DisplayedUnits === "C" ? parseInt(value) : parseInt(round5((value - 32) * 5 / 9)));
  } else {
    return null;
  }
}

function round5(x) {
  return (Math.round(x * 2) / 2).toFixed(1);
}

function toThermostat(value, ThermostatID) {
  debug("toThermostat", getThermostat(ThermostatID).UI.DisplayedUnits === "C" ? value : ((value * 9 / 5) + 32).toFixed(1));
  debug("toThermostat", value, getThermostat(ThermostatID));

  return (getThermostat(ThermostatID).UI.DisplayedUnits === "C" ? value : ((value * 9 / 5) + 32).toFixed(1));
}

function currentState(thermostat) {
  var state = 0;
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
    case 5: // Off on Auto thermostats
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

function targetTemperature(thermostat) {
  var targetTemperature;
  switch (thermostat.UI.SystemSwitchPosition) {
    case 2: // Off
      // Not sure what to do here, so will use heat set point
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 1: // Heat
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 3: // Cool
      targetTemperature = thermostat.UI.CoolSetpoint;
      break;
    case 4: // Auto
      // Not sure what to do here, so will use heat set point
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    default:
      // Not sure what to do here, so will display current temperature
      targetTemperature = thermostat.UI.DispTemperature;
  }

  return (targetTemperature);
}

function ChangeThermostatSetpoint(accessory, valueHeat, valueCool) {
  // debug("ChangeThermostatSetpoint", getThermostat(accessory));
  var HeatSetpoint = toCelcius(valueHeat, getThermostat(accessory)) || getThermostat(accessory).UI.HeatSetpoint;
  var CoolSetpoint = toCelcius(valueCool, getThermostat(accessory)) || getThermostat(accessory).UI.CoolSetpoint;

  var StatusHeat = getThermostat(accessory).UI.StatusHeat;
  var StatusCool = getThermostat(accessory).UI.StatusCool;

  if (this.usePermanentHolds) {
    StatusHeat = 2;
    StatusCool = 2;
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
  // debug("TargetHeatingCooling", accessory);
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
  if (!this._username) {
    var err = new Error("Missing This");
    debug("AuthenticateUserLogin", err);
  }
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

function thermostatMessage(desiredState) {
  debug("thermostatMessage", desiredState);
  return ({
    ChangeThermostatUI: {
      sessionID: {
        $t: this.sessionID
      },
      thermostatID: {
        $t: desiredState.ThermostatID
      },
      changeSystemSwitch: {
        $t: 1
      },
      systemSwitch: {
        $t: systemSwitch(desiredState)
      },
      changeHeatSetpoint: {
        $t: 1
      },
      heatSetpoint: {
        $t: heatSetpoint(desiredState)
      },
      changeCoolSetpoint: {
        $t: 1
      },
      coolSetpoint: {
        $t: coolSetpoint(desiredState)
      },
      changeHeatNextPeriod: {
        $t: 1
      },
      heatNextPeriod: {
        $t: getThermostat(desiredState.ThermostatID).UI.HeatNextPeriod
      },
      changeCoolNextPeriod: {
        $t: 1
      },
      coolNextPeriod: {
        $t: getThermostat(desiredState.ThermostatID).UI.CoolNextPeriod
      },
      changeStatusHeat: {
        $t: 1
      },
      statusHeat: {
        $t: getThermostat(desiredState.ThermostatID).UI.StatusHeat
      },
      changeStatusCool: {
        $t: 1
      },
      statusCool: {
        $t: getThermostat(desiredState.ThermostatID).UI.StatusCool
      }
    }
  });
}

function systemSwitch(desiredState) {
  debug("desiredState.TargetHeatingCooling", desiredState.TargetHeatingCooling);
  var state;
  switch (desiredState.TargetHeatingCooling) {
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
    case null:
      debug("null", getThermostat(desiredState.ThermostatID).UI.SystemSwitchPosition);
      break;
    default:
      debug("default");
      state = 0;
  }

  return (state);
}

function heatSetpoint(desiredState) {
  // debug("desiredState.heatSetpoint", desiredState, getThermostat(desiredState.ThermostatID));
  var response = getThermostat(desiredState.ThermostatID).UI.HeatSetpoint;
  if (desiredState.TargetTemperature) {
    switch (getThermostat(desiredState.ThermostatID).UI.SystemSwitchPosition) {
      case 1: // TCC Heat
        response = toThermostat(desiredState.TargetTemperature, desiredState.ThermostatID);
        break;
      case 2: // TCC Off
      case 3: // TCC Cool
      case 4: // TCC Auto
        break;
    }
  }
  // debug("desiredState.heatSetpoint", desiredState, response);
  return response;
}

function coolSetpoint(desiredState) {
  // debug("desiredState.coolSetpoint", desiredState);
  var response = getThermostat(desiredState.ThermostatID).UI.CoolSetpoint;
  // debug("coolSetpoint", getThermostat(desiredState.ThermostatID).UI, response);
  if (desiredState.TargetTemperature) {
    switch (getThermostat(desiredState.ThermostatID).UI.SystemSwitchPosition) {
      case 1: // TCC Heat
      case 2: // TCC Off
        break;
      case 3: // TCC Cool
        response = toThermostat(desiredState.TargetTemperature, desiredState.ThermostatID);
        break;
      case 4: // TCC Auto
        break;
    }
  }
  return response;
}

function getThermostat(ThermostatID) {
  // debug("getThermostat %s ===", ThermostatID, thermostats.LocationInfo.Thermostats);
  if (Array.isArray(thermostats.LocationInfo.Thermostats.ThermostatInfo)) {
    for (const item of thermostats.LocationInfo.Thermostats.ThermostatInfo) {
      // debug("item %s ===", accessory.context.ThermostatID, item.ThermostatID);
      if (item.ThermostatID === ThermostatID) {
        // debug("Found", item);
        return item;
      }
    }
  } else {
    return (thermostats.LocationInfo.Thermostats.ThermostatInfo);
  }
}
