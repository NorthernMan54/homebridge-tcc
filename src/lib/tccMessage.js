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
  toCelcius: toCelcius,
  toThermostat: toThermostat,
  currentState: currentState,
  stateValidValues: stateValidValues,
  targetState: targetState,
  targetTemperature: targetTemperature,
  systemSwitch: systemSwitch,
  heatSetpoint: heatSetpoint,
  coolSetpoint: coolSetpoint,
  diff: diff,
  validateThermostatData: validateThermostatData
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
  if (!thermostat || !thermostat.device || !thermostat.device.UI) {
    throw new Error("Invalid thermostat data in ChangeThermostatMessage");
  }
  // Make a deep copy to avoid modifying the cached thermostat object
  const thermostatCopy = JSON.parse(JSON.stringify(thermostat));

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
        $t: systemSwitch(desiredState, thermostatCopy)
      },
      changeHeatSetpoint: {
        $t: 1
      },
      heatSetpoint: {
        $t: heatSetpoint(desiredState, thermostatCopy)
      },
      changeCoolSetpoint: {
        $t: 1
      },
      coolSetpoint: {
        $t: coolSetpoint(desiredState, thermostatCopy)
      },
      changeHeatNextPeriod: {
        $t: 1
      },
      heatNextPeriod: {
        $t: thermostatCopy.device.UI.HeatNextPeriod
      },
      changeCoolNextPeriod: {
        $t: 1
      },
      coolNextPeriod: {
        $t: thermostatCopy.device.UI.CoolNextPeriod
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
  devices.hb = {};
  const locationInfos = Array.isArray(devices.LocationInfo)
    ? devices.LocationInfo
    : devices.LocationInfo
      ? [devices.LocationInfo]
      : [];

  locationInfos
    .map((LocationInfo) => LocationInfo?.Thermostats?.ThermostatInfo)
    .filter((info) => info !== undefined && info !== null)
    .forEach((info) => {
      (Array.isArray(info) ? info : [info]).forEach((item) => {
        devices.hb[item.ThermostatID.toString()] = toHb(item);
      });
    });

  return devices;
}

function toHb(thermostat) {
  const response = {};

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
  // Track the last physical heat mode (0=emergency heat, 1=regular heat)
  // This is used when setting heat mode from HomeKit to maintain user's physical thermostat preference
  if (thermostat.UI.SystemSwitchPosition === 0 || thermostat.UI.SystemSwitchPosition === 1) {
    response.LastPhysicalHeatMode = thermostat.UI.SystemSwitchPosition;
  }
  return response;
}

function toCelcius(value, thermostat) {
  if (value !== null && value !== undefined) {
    return (thermostat.UI.DisplayedUnits === "C" ? parseFloat(value) : parseFloat(((value - 32) * 5 / 9).toFixed(1)));
  } else {
    return null;
  }
}

function toThermostat(value, thermostat) {
  if (value === undefined || value === null) {
    return value;
  }
  if (!thermostat || !thermostat.device || !thermostat.device.UI) {
    return value;
  }
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
  const mapping = [
    ['CanSetSwitchOff', 0],
    ['CanSetSwitchHeat', 1],
    ['CanSetSwitchCool', 2],
    ['CanSetSwitchAuto', 3]
  ];

  return mapping
    .map(([flag, value]) => (thermostat.UI[flag] ? value : undefined))
    .filter((value) => value !== undefined);
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
  let targetTemperature;
  switch (thermostat.UI.SystemSwitchPosition) {
    case 2: // Off
      // Not sure what to do here, so will use heat set point
      targetTemperature = thermostat.UI.HeatSetpoint;
      break;
    case 0: // Emergency heat
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

  return targetTemperature;
}

function systemSwitch(desiredState, thermostat) {
  // var debug = require('debug')('tcc-libMessage');
  let state;
  switch (desiredState.TargetHeatingCooling) {
    case 0: // Off
      state = 2;
      break;
    case 1: // Heat
      // Use the last physical heat mode preference if available
      // This allows maintaining emergency heat vs regular heat preference
      if (thermostat.LastPhysicalHeatMode !== undefined &&
          (thermostat.LastPhysicalHeatMode === 0 || thermostat.LastPhysicalHeatMode === 1)) {
        state = thermostat.LastPhysicalHeatMode;
        // debug("Using LastPhysicalHeatMode=%s for heat command", state);
      } else {
        state = 1; // Default to regular heat
        // debug("No LastPhysicalHeatMode found, using default regular heat (1)");
      }
      break;
    case 2: // Cool
      state = 3;
      break;
    case 3: // Auto
      state = 4;
      break;
    case undefined:
      state = thermostat.device.UI.SystemSwitchPosition;
      break;
    default:
      state = thermostat.device.UI.SystemSwitchPosition;
  }

  thermostat.device.UI.SystemSwitchPosition = state;
  return state;
}

function heatSetpoint(desiredState, thermostat) {
  const ui = thermostat.device.UI;
  const targetDefined = desiredState.TargetTemperature !== undefined;
  const thresholdDefined = desiredState.HeatingThresholdTemperature !== undefined;

  if (!targetDefined && !thresholdDefined) {
    return ui.HeatSetpoint;
  }

  if ((ui.SystemSwitchPosition === 0 || ui.SystemSwitchPosition === 1) && targetDefined) {
    return toThermostat(desiredState.TargetTemperature, thermostat);
  }

  if ((ui.SystemSwitchPosition === 4 || ui.SystemSwitchPosition === 5) && thresholdDefined) {
    return toThermostat(desiredState.HeatingThresholdTemperature, thermostat);
  }

  return ui.HeatSetpoint;
}

function coolSetpoint(desiredState, thermostat) {
  const ui = thermostat.device.UI;
  const targetDefined = desiredState.TargetTemperature !== undefined;
  const thresholdDefined = desiredState.CoolingThresholdTemperature !== undefined;

  if (!targetDefined && !thresholdDefined) {
    return ui.CoolSetpoint;
  }

  if (ui.SystemSwitchPosition === 3) {
    if (targetDefined) {
      return toThermostat(desiredState.TargetTemperature, thermostat);
    }
    if (thresholdDefined) {
      return toThermostat(desiredState.CoolingThresholdTemperature, thermostat);
    }
  }

  if ((ui.SystemSwitchPosition === 4 || ui.SystemSwitchPosition === 5) && thresholdDefined) {
    return toThermostat(desiredState.CoolingThresholdTemperature, thermostat);
  }

  return ui.CoolSetpoint;
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

function validateThermostatData(data, context = 'thermostat') {
  // Basic type check
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid ${context} data: not an object`);
  }

  // Required fields
  const requiredFields = ['ThermostatID', 'Name'];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Invalid ${context} data: missing required field '${field}'`);
    }
  }

  // Validate temperature fields if present
  const tempFields = [
    'CurrentTemperature',
    'TargetTemperature',
    'HeatingThresholdTemperature',
    'CoolingThresholdTemperature',
    'OutsideTemperature'
  ];

  for (const field of tempFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const temp = data[field];
      // Reasonable temperature range: -50°C to 60°C
      if (typeof temp !== 'number' || temp < -50 || temp > 60) {
        console.warn(`Warning: Suspicious temperature value for ${field}: ${temp}°C in ${context}`);
      }
    }
  }

  // Validate state values if present
  if (data.CurrentHeatingCoolingState !== undefined) {
    if (![0, 1, 2].includes(data.CurrentHeatingCoolingState)) {
      throw new Error(`Invalid CurrentHeatingCoolingState: ${data.CurrentHeatingCoolingState}`);
    }
  }

  if (data.TargetHeatingCoolingState !== undefined) {
    if (![0, 1, 2, 3].includes(data.TargetHeatingCoolingState)) {
      throw new Error(`Invalid TargetHeatingCoolingState: ${data.TargetHeatingCoolingState}`);
    }
  }

  // Validate humidity if present (0-100, or 128 for invalid)
  const humidityFields = ['InsideHumidity', 'OutsideHumidity'];
  for (const field of humidityFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const humidity = data[field];
      if (humidity !== 128 && (humidity < 0 || humidity > 100)) {
        console.warn(`Warning: Suspicious humidity value for ${field}: ${humidity}% in ${context}`);
      }
    }
  }

  return true;
}
