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
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      "@xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "@xmlns": "http://services.alarmnet.com/Services/MobileV2/",
      "soap:Body": body
      }
    }
  );
}

function AuthenticateUserLoginMessage(username, password) {
  return ({
    AuthenticateUserLogin: {
      username: username,
      password: password,
      applicationID: "357568d9-38ff-4fda-bfe2-46b0fa1dd864",
      applicationVersion: "2",
      uiLanguage: "Default"
    }
  });
}

function GetLocationsMessage(sessionID) {
  return ({
    GetLocations: {
      sessionID: sessionID
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
      sessionID: sessionID,
      thermostatID: desiredState.ThermostatID,
      changeSystemSwitch: 1,
      systemSwitch: systemSwitch(desiredState, thermostat),
      changeHeatSetpoint: 1,
      heatSetpoint: heatSetpoint(desiredState, thermostat),
      changeCoolSetpoint: 1,
      coolSetpoint: coolSetpoint(desiredState, thermostat),
      changeHeatNextPeriod: 1,
      heatNextPeriod: thermostat.device.UI.HeatNextPeriod,
      changeCoolNextPeriod: 1,
      coolNextPeriod: thermostat.device.UI.CoolNextPeriod,
      changeStatusHeat: 1,
      statusHeat: (usePermanentHolds ? 2 : 1),
      changeStatusCool: 1,
      statusCool: (usePermanentHolds ? 2 : 1)
    }
  });
}

function GetCommTaskStateMessage(sessionID, commTaskID) {
  return ({
    GetCommTaskState: {
      sessionID: sessionID,
      commTaskID: commTaskID
    }
  });
}

function GetThermostatMessage(sessionID, ThermostatID) {
  return ({
    GetThermostat: {
      sessionID: sessionID,
      thermostatID: ThermostatID
    }
  });
}

function normalizeToHb(devices) {
  devices.hb = [];
  // Flatten structure
  if (Array.isArray(devices.LocationInfo)) {
    devices.LocationInfo.forEach((LocationInfo, i) => {
      if (Array.isArray(LocationInfo.Thermostats.ThermostatInfo)) {
        LocationInfo.Thermostats.ThermostatInfo.forEach((item, i) => {
          // debug("normalizeToHb", item.ThermostatID);
          devices.hb[item.ThermostatID.toString()] = toHb(item);
        });
      } else {
        // console.log("normalizeToHb", LocationInfo.Thermostats);
        devices.hb[LocationInfo.Thermostats.ThermostatInfo.ThermostatID.toString()] = toHb(LocationInfo.Thermostats.ThermostatInfo);
      }
    });
  } else {
    if (Array.isArray(devices.LocationInfo.Thermostats.ThermostatInfo)) {
      devices.LocationInfo.Thermostats.ThermostatInfo.forEach((item, i) => {
        // debug("normalizeToHb", item.ThermostatID);
        devices.hb[item.ThermostatID.toString()] = toHb(item);
      });
    } else {
      devices.hb[devices.LocationInfo.Thermostats.ThermostatInfo.ThermostatID.toString()] = toHb(devices.LocationInfo.Thermostats.ThermostatInfo);
    }
  }
  // debug("normalizeToHb", devices.hb);
  return devices;
}

function toHb(thermostat) {
  var response = {};

  response.ThermostatID = thermostat.ThermostatID;
  response.Name = thermostat.UserDefinedDeviceName;
  response.Model = thermostat.ModelTypeName;
  response.OutsideTemperature = toCelcius(thermostat.UI.OutdoorTemp, thermostat);
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
  response.OutsideHumidity = thermostat.UI.OutdoorHumidity;
  response.InsideHumidity = thermostat.UI.IndoorHumidity;
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
    case "Off":
      state = 0;
      break;
    case "Heating":
      state = 1;
      break;
    case "Cooling":
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
      state = 0;
      break;
    case 0: // Emergency heat
    case 1: // Heat
      state = 1;
      break;
    case 3: // Cool
      state = 2;
      break;
    case 4: // Auto heat
    case 5: // Auto cool
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
    case 4: // Auto heat
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 3: // Cool
    case 5: // Auto cool
      targetTemperature = thermostat.UI.CoolSetpoint;
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
      case 0: // TCC Emergency Heat
      case 1: // TCC Heat
        response = toThermostat(desiredState.TargetTemperature, thermostat);
        break;
      case 2: // TCC Off
        break;
      case 3: // TCC Cool
        break;
      case 4: // TCC Auto heat
      case 5: // TCC Auto cool
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
      case 4: // TCC Auto heat
      case 5: // TCC Auto cool
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
