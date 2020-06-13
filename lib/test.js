var message = {
  ThermostatID: 123456,
  MacID: 12345,
  DomainID: 44449,
  Instance: 0,
  DeviceName: 'UPSTAIRS',
  UserDefinedDeviceName: 'Upstairs Air',
  Upgrading: false,
  ThermostatsAlerts: {},
  UI: {
    Created: '2020-06-12T23:50:18',
    ThermostatLocked: false,
    OutdoorTemp: 70,
    DispTemperature: 76,
    HeatSetpoint: 70,
    CoolSetpoint: 78,
    DisplayedUnits: 'F',
    StatusHeat: 2,
    StatusCool: 2,
    HoldUntilCapable: true,
    ScheduleCapable: true,
    VacationHold: 0,
    DualSetpointStatus: false,
    HeatNextPeriod: 67,
    CoolNextPeriod: 67,
    HeatLowerSetptLimit: 40,
    HeatUpperSetptLimit: 80,
    CoolLowerSetptLimit: 65,
    CoolUpperSetptLimit: 99,
    SchedHeatSp: 70,
    SchedCoolSp: 78,
    SystemSwitchPosition: 3,
    CanSetSwitchAuto: false,
    CanSetSwitchCool: true,
    CanSetSwitchOff: true,
    CanSetSwitchHeat: true,
    CanSetSwitchEmergencyHeat: false,
    CanSetSwitchSouthernAway: false,
    Deadband: 0,
    OutdoorHumidity: 58,
    IndoorHumidity: 46,
    Commercial: false,
    SystemSwitchChangeSource: [Object],
    HeatSetpointChangeSource: [Object],
    CoolSetpointChangeSource: [Object]
  },
  Fan: {
    CanControl: true,
    Position: 'Auto',
    CanSetAuto: true,
    CanSetCirculate: true,
    CanFollowSchedule: false,
    CanSetOn: true,
    IsFanRunning: false
  },
  Humidification: {
    CanControlHumidification: false,
    CanControlDehumidification: false,
    HumidificationSetPoint: 35,
    HumidificationUpperLimit: 60,
    HumidificationLowerLimit: 10,
    HumidificationMode: 'Off',
    DehumidificationSetPoint: 50,
    DehumidificationUpperLimit: 80,
    DehumidificationLowerLimit: 40,
    DehumidificationMode: 'Off',
    Deadband: 255
  },
  EquipmentStatus: 'Off',
  CanControlSchedule: true,
  WillSupportSchedule: false,
  ModelTypeID: 18,
  ModelTypeName: 'Manhattan'
};

console.log("toHb", toHb(message));

console.log("ChangeThermostatMessage", ChangeThermostatMessage(12345, {
  ThermostatID: 123456,
  TargetHeatingCooling: 2,
  CoolingThresholdTemperature: 21.1
}, toHb(message), false));

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

function round5(x) {
  return (Math.round(x * 2) / 2).toFixed(1);
}

function toThermostat(value, thermostat) {
  console.log("toThermostat", value, thermostat.device.UI.DisplayedUnits);
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
  console.log("desiredState.coolSetpoint", desiredState);
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
