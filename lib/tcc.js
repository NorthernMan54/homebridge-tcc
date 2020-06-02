const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var debug = require('debug')('tcc-lib');

// var thermostats = {};

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
  this.timeout = 5000; // SOAP request timeout
  this.usePermanentHolds = options.usePermanentHolds;
  this.desiredState = {};
  this.deferrals = [];
  this.updating = false;
  this.waitTimeUpdate = 100;
  this.thermostats = {};
  pollThermostat.call(this, function(err, result) {
    if (!err) {
      // debug("initial", result);
      this.thermostats = result;
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
      this.sessionID = await this._login();
      debug("TCC - Login Succeeded");
    }
    var current = await this._GetLocationListData();
    if (this.thermostats.LocationInfo && current.LocationInfo) {
      // debug("pollThermostat", JSON.stringify(current, null, 2));
      debug("pollThermostat - delta", JSON.stringify(diff(this.thermostats, current), null, 2));
    }
    this.thermostats = current;
    callback(null, this.thermostats);
  } catch (err) {
    console.error("pollThermostat Error:", err.message);
    debug("pollThermostat Error:", err);
    callback(err, this.thermostats);
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
      var CommTaskID = await this._UpdateThermostat(desiredState);
      await this._GetCommTaskState(CommTaskID);
      var thermostat = await this._GetThermostat(desiredState.ThermostatID);
      this.recentlyUpdated = true;
      for (const d of deferrals) {
        d.resolve(thermostat);
      }
      setTimeout(() => {
        this.recentlyUpdated = false;
      }, 500);
    } catch (err) {
      console.error("_put Error:", err);
      this.sessionID = null;
      for (const d of deferrals) {
        d.reject(err);
      }
    }
  })();
};

tcc.prototype._UpdateThermostat = function(desiredState) {
  debug("_UpdateThermostat()", desiredState);
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
        }
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds)));
        // debug("SOAP Message", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
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
          // debug("_UpdateThermostat", ChangeThermostat);
          if (ChangeThermostat.Result === "Success") {
            debug("Success: _UpdateThermostat %s", ChangeThermostat);
            resolve(ChangeThermostat.CommTaskID);
          } else {
            this.sessionID = null;
            debug("ERROR: _UpdateThermostat %s", ChangeThermostat.Result, message);
            reject(new Error("ERROR: _UpdateThermostat %s", ChangeThermostat.Result));
          }
        } else {
          debug("ERROR: _UpdateThermostat %s", response, message);
          reject(new Error("ERROR: _UpdateThermostat %s", ChangeThermostat.Result));
        }
      } catch (err) {
        console.error("_UpdateThermostat Error:", err);
        debug("_UpdateThermostat message", parser.toXml(soapMessage(ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds))));
        reject(err);
        this.sessionID = null;
      }
    })();
  });
};

tcc.prototype._login = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLoginMessage(this._username, this._password)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
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
            debug("ERROR: Login Failed %s", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result, message);
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
};

tcc.prototype._GetCommTaskState = function(CommTaskID) {
  // SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetCommTaskState
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetCommTaskState';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetCommTaskStateMessage(this.sessionID, CommTaskID)));
        // debug("_GetCommTaskState", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetCommTaskState", response.statusCode, response.body);
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
            debug("GetCommTaskState Success %s", GetCommTaskStateResponse.GetCommTaskStateResult);
            resolve();
          } else {
            debug("ERROR: GetCommTaskState Failed %s", GetCommTaskStateResponse.GetCommTaskStateResult, message);
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

tcc.prototype._GetThermostat = function(ThermostatID) {
  // SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetThermostat
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetThermostat';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetThermostatMessage(this.sessionID, ThermostatID)));
        // debug("_GetThermostat", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetThermostat", response.statusCode, response.body);
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
          // debug("GetThermostatResult", GetThermostatResult);
          if (GetThermostatResult.Result === "Success") {
            // debug("_GetThermostat - delta", JSON.stringify(diff(GetThermostatResult.Thermostat, this.thermostats.hb[ThermostatID.toString()]), null, 2));
            this.thermostats.hb[ThermostatID.toString()] = toHb(GetThermostatResult.Thermostat);
            // debug("_GetThermostat Temp %s Switch %s", toHb(GetThermostatResult.Thermostat).TargetTemperature, toHb(GetThermostatResult.Thermostat).TargetHeatingCoolingState);
            resolve(toHb(GetThermostatResult.Thermostat));
          } else {
            debug("ERROR: GetThermostat Failed %s", GetThermostatResult.Result, message);
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
};

tcc.prototype._GetLocationListData = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetLocationsMessage(this.sessionID)));
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
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
            debug("ERROR: GetLocations %s", GetLocationsResult.Result, message);
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

function AuthenticateUserLoginMessage(username, password) {
  return ({
    AuthenticateUserLogin: {
      username: {
        $t: username
      },
      password: {
        $t: password
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

function GetLocationsMessage(sessionID) {
  return ({
    GetLocations: {
      sessionID: {
        $t: sessionID
      }
    }
  });
}

function ChangeThermostatMessage(sessionID, desiredState, thermostat, usePermanentHolds) {
  debug("ChangeThermostatMessage", desiredState);
  return ({
    ChangeThermostatUI: {
      sessionID: {
        $t: sessionID
      },
      thermostatID: {
        $t: desiredState.ThermostatID
      },
      changeSystemSwitch: {
        $t: 1
      },
      systemSwitch: {
        $t: systemSwitch(desiredState, thermostat)
      },
      changeHeatSetpoint: {
        $t: 1
      },
      heatSetpoint: {
        $t: heatSetpoint(desiredState, thermostat)
      },
      changeCoolSetpoint: {
        $t: 1
      },
      coolSetpoint: {
        $t: coolSetpoint(desiredState, thermostat)
      },
      changeHeatNextPeriod: {
        $t: 1
      },
      heatNextPeriod: {
        $t: thermostat.device.UI.HeatNextPeriod
      },
      changeCoolNextPeriod: {
        $t: 1
      },
      coolNextPeriod: {
        $t: thermostat.device.UI.CoolNextPeriod
      },
      changeStatusHeat: {
        $t: 1
      },
      statusHeat: {
        $t: (usePermanentHolds ? 2 : thermostat.device.UI.StatusHeat)
      },
      changeStatusCool: {
        $t: 1
      },
      statusCool: {
        $t: (usePermanentHolds ? 2 : thermostat.device.UI.StatusCool)
      }
    }
  });
}

function GetCommTaskStateMessage(sessionID, commTaskID) {
  return ({
    GetCommTaskState: {
      sessionID: {
        $t: sessionID
      },
      commTaskID: {
        $t: commTaskID
      }
    }
  });
}

function GetThermostatMessage(sessionID, ThermostatID) {
  return ({
    GetThermostat: {
      sessionID: {
        $t: sessionID
      },
      thermostatID: {
        $t: ThermostatID
      }
    }
  });
}

function normalizeToHb(devices) {
  devices.hb = [];
  if (Array.isArray(devices.LocationInfo.Thermostats.ThermostatInfo)) {
    devices.LocationInfo.Thermostats.ThermostatInfo.forEach((item, i) => {
      // debug("normalizeToHb", item.ThermostatID);
      devices.hb[item.ThermostatID.toString()] = toHb(item);
    });
  } else {
    devices.hb[devices.LocationInfo.Thermostats.ThermostatInfo.ThermostatID.toString()] = toHb(devices.LocationInfo.Thermostats.ThermostatInfo);
  }
  debug("normalizeToHb", devices.hb);
  return devices;
}

function toHb(thermostat) {
  var response = {};

  response.ThermostatID = thermostat.ThermostatID;
  response.Name = thermostat.UserDefinedDeviceName;
  response.Model = thermostat.ModelTypeName;
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
  response.device = thermostat;
  return response;
}

function toCelcius(value, thermostat) {
  if (value) {
    return (thermostat.UI.DisplayedUnits === "C" ? parseFloat(value) : round5((value - 32) * 5 / 9));
  } else {
    return null;
  }
}

function round5(x) {
  return (Math.round(x * 2) / 2).toFixed(1);
}

function toThermostat(value, thermostat) {
  return (thermostat.device.UI.DisplayedUnits === "C" ? value : ((value * 9 / 5) + 32).toFixed(0));
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
  return parseFloat(state);
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

  return parseFloat(state);
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

function systemSwitch(desiredState, thermostat) {
  // debug("systemSwitch desiredState.TargetHeatingCooling", desiredState);
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
    case undefined:
      // debug("systemSwitch undefined", thermostat.device.UI.SystemSwitchPosition);
      state = thermostat.device.UI.SystemSwitchPosition;
      break;
    default:
      // debug("systemSwitch default");
      state = thermostat.device.UI.SystemSwitchPosition;
  }

  return (state);
}

function heatSetpoint(desiredState, thermostat) {
  // debug("desiredState.heatSetpoint", desiredState, thermostat);
  // HeatingThresholdTemperature
  var response = thermostat.device.UI.HeatSetpoint;
  if (desiredState.TargetTemperature || desiredState.HeatingThresholdTemperature) {
    switch (thermostat.device.UI.SystemSwitchPosition) {
      case 1: // TCC Heat
        response = toThermostat(desiredState.TargetTemperature, thermostat);
        break;
      case 2: // TCC Off
        break;
      case 3: // TCC Cool
        break;
      case 4: // TCC Auto
        response = toThermostat(desiredState.HeatingThresholdTemperature, thermostat);
        break;
    }
  }
  // debug("desiredState.heatSetpoint", desiredState, response);
  return response;
}

function coolSetpoint(desiredState, thermostat) {
  // debug("desiredState.coolSetpoint", desiredState);
  // CoolingThresholdTemperature
  var response = thermostat.device.UI.CoolSetpoint;
  // debug("coolSetpoint", getThermostat(desiredState.ThermostatID).UI, response);
  if (desiredState.TargetTemperature || desiredState.CoolingThresholdTemperature) {
    switch (thermostat.device.UI.SystemSwitchPosition) {
      case 1: // TCC Heat
      case 2: // TCC Off
        break;
      case 3: // TCC Cool
        response = toThermostat(desiredState.TargetTemperature, thermostat);
        break;
      case 4: // TCC Auto
        response = toThermostat(desiredState.CoolingThresholdTemperature, thermostat);
        break;
    }
  }
  return response;
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

/*
tcc.prototype._getThermostat = function(ThermostatID) {
  debug("getThermostat %s ===", ThermostatID, this.thermostats);
  if (Array.isArray(this.thermostats.LocationInfo.Thermostats.ThermostatInfo)) {
    for (const item of this.thermostats.LocationInfo.Thermostats.ThermostatInfo) {
      // debug("item %s ===", accessory.context.ThermostatID, item.ThermostatID);
      if (item.ThermostatID === ThermostatID) {
        // debug("Found", item);
        return item;
      }
    }
  } else {
    return (this.thermostats.LocationInfo.Thermostats.ThermostatInfo);
  }
};
*/
