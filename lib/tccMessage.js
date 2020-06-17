// var debug = require('debug')('tcc-libMessage');

module.exports = {
  soapMessage: soapMessage,
  AuthenticateUserLoginMessage: AuthenticateUserLoginMessage,
  GetLocationsMessage: GetLocationsMessage,
  ChangeThermostatMessage: ChangeThermostatMessage,
  GetCommTaskStateMessage: GetCommTaskStateMessage,
  GetThermostatMessage: GetThermostatMessage,
  normalizeToHb: normalizeToHb,
  toHb: toHb,
  diff: diff
};

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

// Status Heat / Cool
//  0 - Follow schedule
//  1 - Temporary override
//  2 - Permanent override

function ChangeThermostatMessage(sessionID, desiredState, thermostat, usePermanentHolds) {
  // debug("ChangeThermostatMessage", desiredState);
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
        $t: (usePermanentHolds ? 2 : 1)
      },
      changeStatusCool: {
        $t: 1
      },
      statusCool: {
        $t: (usePermanentHolds ? 2 : 1)
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
  // debug("normalizeToHb", devices.hb);
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
    return (thermostat.UI.DisplayedUnits === "C" ? parseFloat(value) : parseFloat((value - 32) * 5 / 9).toFixed(1));
  } else {
    return null;
  }
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

  thermostat.device.UI.SystemSwitchPosition = state;
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
  // console.log("desiredState.coolSetpoint", desiredState);
  // CoolingThresholdTemperature
  var response = thermostat.device.UI.CoolSetpoint;
  // debug("coolSetpoint", getThermostat(desiredState.ThermostatID).UI, response);
  if (desiredState.TargetTemperature || desiredState.CoolingThresholdTemperature) {
    switch (thermostat.device.UI.SystemSwitchPosition) {
      case 1: // TCC Heat
      case 2: // TCC Off
        break;
      case 3: // TCC Cool
        if (desiredState.TargetTemperature) {
          response = toThermostat(desiredState.TargetTemperature, thermostat);
        } else if (desiredState.CoolingThresholdTemperature) {
          response = toThermostat(desiredState.CoolingThresholdTemperature, thermostat);
        }
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
