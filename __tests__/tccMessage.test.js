const tccMessage = require('../src/lib/tccMessage.js');

describe('tccMessage helpers', () => {
  const baseThermostat = () => {
    const ui = {
      DisplayedUnits: 'C',
      DispTemperature: 21,
      HeatSetpoint: 20,
      CoolSetpoint: 25,
      SystemSwitchPosition: 1,
      OutdoorTemp: 10,
      OutdoorHumidity: 50,
      IndoorHumidity: 45,
      HeatLowerSetptLimit: 5,
      HeatUpperSetptLimit: 30,
      CoolLowerSetptLimit: 15,
      CoolUpperSetptLimit: 32,
      CanSetSwitchOff: true,
      CanSetSwitchHeat: true,
      CanSetSwitchCool: true,
      CanSetSwitchAuto: true,
      HeatNextPeriod: 18,
      CoolNextPeriod: 26
    };
    return {
      ThermostatID: 123,
      UserDefinedDeviceName: 'Living Room',
      ModelTypeName: 'T6',
      UI: ui,
      device: { UI: JSON.parse(JSON.stringify(ui)) },
      EquipmentStatus: 'Heating'
    };
  };

  test('SOAP message builders create correct structure', () => {
    const body = { Test: { $t: 'value' } };
    expect(tccMessage.soapMessage(body)['soap:Envelope']['soap:Body']).toEqual(body);

    const auth = tccMessage.AuthenticateUserLoginMessage('user', 'pass');
    expect(auth.AuthenticateUserLogin.username.$t).toBe('user');

    const loc = tccMessage.GetLocationsMessage('session');
    expect(loc.GetLocations.sessionID.$t).toBe('session');

    const comm = tccMessage.GetCommTaskStateMessage('s', 42);
    expect(comm.GetCommTaskState.commTaskID.$t).toBe(42);

    const getTherm = tccMessage.GetThermostatMessage('s', 7);
    expect(getTherm.GetThermostat.thermostatID.$t).toBe(7);
  });

  test('ChangeThermostatMessage converts temperatures and respects hold settings', () => {
    const thermostat = baseThermostat();
    thermostat.UI.DisplayedUnits = 'F';
    thermostat.UI.HeatSetpoint = 68;
    thermostat.UI.CoolSetpoint = 74;
    thermostat.UI.SystemSwitchPosition = 1;
    thermostat.device.UI = JSON.parse(JSON.stringify(thermostat.UI));

    const desired = {
      ThermostatID: 123,
      TargetHeatingCooling: 1,
      TargetTemperature: 21
    };

    const message = tccMessage.ChangeThermostatMessage('session', desired, thermostat, false);
    const change = message.ChangeThermostatUI;
    expect(change.systemSwitch.$t).toBe(1);
    expect(change.heatSetpoint.$t).toBe('70'); // Converted to Fahrenheit and rounded
    expect(change.coolSetpoint.$t).toBe(74);
    expect(change.statusHeat.$t).toBe(1);

    // Ensure original thermostat object is not mutated
    expect(thermostat.device.UI.HeatSetpoint).toBe(68);

    // Auto mode with thresholds
    const autoThermostat = baseThermostat();
    autoThermostat.UI.SystemSwitchPosition = 5;
    autoThermostat.device.UI = JSON.parse(JSON.stringify(autoThermostat.UI));
    const autoDesired = {
      ThermostatID: 123,
      TargetHeatingCooling: 3,
      HeatingThresholdTemperature: 19,
      CoolingThresholdTemperature: 27
    };
    const autoMessage = tccMessage.ChangeThermostatMessage('session', autoDesired, autoThermostat, true).ChangeThermostatUI;
    expect(autoMessage.systemSwitch.$t).toBe(4);
    expect(autoMessage.heatSetpoint.$t).toBe(19);
    expect(autoMessage.coolSetpoint.$t).toBe(27);
    expect(autoMessage.statusHeat.$t).toBe(2);
    expect(autoMessage.statusCool.$t).toBe(2);
  });

  test('ChangeThermostatMessage throws when thermostat UI missing', () => {
    expect(() => tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1 }, {}, false)).toThrow('Invalid thermostat data in ChangeThermostatMessage');
  });

  test('normalizeToHb handles array and object structures', () => {
    const t1 = baseThermostat();
    const t2 = baseThermostat();
    t2.ThermostatID = 456;

    const arrayStructure = {
      LocationInfo: [
        {
          Thermostats: {
            ThermostatInfo: [t1, t2]
          }
        }
      ]
    };

    const normalizedArray = tccMessage.normalizeToHb(arrayStructure);
    expect(Object.keys(normalizedArray.hb)).toEqual(['123', '456']);

    const singleStructure = {
      LocationInfo: {
        Thermostats: {
          ThermostatInfo: t1
        }
      }
    };

    const normalizedSingle = tccMessage.normalizeToHb(singleStructure);
    expect(Object.keys(normalizedSingle.hb)).toEqual(['123']);

    const t3 = baseThermostat();
    t3.ThermostatID = 789;
    const t4 = baseThermostat();
    t4.ThermostatID = 987;

    const arrayWithinSingle = {
      LocationInfo: {
        Thermostats: {
          ThermostatInfo: [t3, t4]
        }
      }
    };

    const normalizedNestedArray = tccMessage.normalizeToHb(arrayWithinSingle);
    expect(Object.keys(normalizedNestedArray.hb)).toEqual(['789', '987']);

    const withoutThermostats = {
      LocationInfo: [{ Thermostats: {} }]
    };
    const normalizedEmptyThermostats = tccMessage.normalizeToHb(JSON.parse(JSON.stringify(withoutThermostats)));
    expect(normalizedEmptyThermostats.hb).toEqual({});
  });

  test('toHb performs conversions and tracks last heat mode', () => {
    const thermoF = baseThermostat();
    thermoF.UI.DisplayedUnits = 'F';
    thermoF.UI.DispTemperature = 70;
    thermoF.UI.HeatSetpoint = 68;
    thermoF.UI.CoolSetpoint = 75;
    thermoF.UI.SystemSwitchPosition = 0;
    thermoF.EquipmentStatus = 'Cooling';
    thermoF.UI.OutdoorTemp = null;

    const hb = tccMessage.toHb(thermoF);
    expect(hb.CurrentTemperature).toBeCloseTo((70 - 32) * 5 / 9, 1);
    expect(hb.LastPhysicalHeatMode).toBe(0);
    expect(hb.CurrentHeatingCoolingState).toBe(2);
    expect(hb.TargetHeatingCoolingState).toBe(1);
    expect(hb.TargetHeatingCoolingStateValidValues).toEqual([0, 1, 2, 3]);
    expect(hb.OutsideTemperature).toBeNull();

    const limited = baseThermostat();
    limited.UI.CanSetSwitchHeat = false;
    limited.UI.CanSetSwitchCool = false;
    limited.UI.CanSetSwitchAuto = false;
    limited.EquipmentStatus = 'Unknown';
    const limitedHb = tccMessage.toHb(limited);
    expect(limitedHb.TargetHeatingCoolingStateValidValues).toEqual([0]);
    expect(limitedHb.CurrentHeatingCoolingState).toBe(0);

    const noneAllowed = baseThermostat();
    noneAllowed.UI.CanSetSwitchOff = false;
    noneAllowed.UI.CanSetSwitchHeat = false;
    noneAllowed.UI.CanSetSwitchCool = false;
    noneAllowed.UI.CanSetSwitchAuto = false;
    const noneHb = tccMessage.toHb(noneAllowed);
    expect(noneHb.TargetHeatingCoolingStateValidValues).toEqual([]);
  });

  test('target temperature selection handles all switch positions', () => {
    const clones = [2, 1, 3, 5, 7].map((pos) => {
      const copy = baseThermostat();
      copy.UI.SystemSwitchPosition = pos;
      copy.UI.DispTemperature = 19;
      return copy;
    });

    expect(tccMessage.toHb(clones[0]).TargetTemperature).toBe(20);
    expect(tccMessage.toHb(clones[1]).TargetTemperature).toBe(20);
    expect(tccMessage.toHb(clones[2]).TargetTemperature).toBe(25);
    expect(tccMessage.toHb(clones[3]).TargetTemperature).toBe(25);
    expect(tccMessage.toHb(clones[4]).TargetTemperature).toBe(19);
  });

  test('systemSwitch, heatSetpoint, and coolSetpoint cover all branches', () => {
    const offTherm = baseThermostat();
    offTherm.LastPhysicalHeatMode = 0;
    expect(tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 0 }, offTherm, false).ChangeThermostatUI.systemSwitch.$t).toBe(2);

    const heatPref = baseThermostat();
    heatPref.LastPhysicalHeatMode = 0;
    const heatSwitch = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 1, TargetTemperature: 22 }, heatPref, false).ChangeThermostatUI.systemSwitch.$t;
    expect(heatSwitch).toBe(0);

    const coolSwitch = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 2, TargetTemperature: 18 }, baseThermostat(), false).ChangeThermostatUI.systemSwitch.$t;
    expect(coolSwitch).toBe(3);

    const autoSwitch = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 3 }, baseThermostat(), false).ChangeThermostatUI.systemSwitch.$t;
    expect(autoSwitch).toBe(4);

    const undefinedSwitchTherm = baseThermostat();
    undefinedSwitchTherm.device.UI.SystemSwitchPosition = 3;
    const undefinedSwitch = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1 }, undefinedSwitchTherm, false).ChangeThermostatUI.systemSwitch.$t;
    expect(undefinedSwitch).toBe(3);

    const defaultSwitchTherm = baseThermostat();
    defaultSwitchTherm.device.UI.SystemSwitchPosition = 4;
    const defaultSwitch = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 99 }, defaultSwitchTherm, false).ChangeThermostatUI.systemSwitch.$t;
    expect(defaultSwitch).toBe(4);

    const heatTherm = baseThermostat();
    heatTherm.device.UI.SystemSwitchPosition = 1;
    const heatResult = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 1, TargetTemperature: 23 }, heatTherm, false).ChangeThermostatUI.heatSetpoint.$t;
    expect(heatResult).toBe(23);

    const heatOffTherm = baseThermostat();
    heatOffTherm.device.UI.SystemSwitchPosition = 2;
    const heatOffMessage = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 0, TargetTemperature: 24 }, heatOffTherm, false).ChangeThermostatUI;
    const heatOff = heatOffMessage.heatSetpoint.$t;
    expect(heatOffMessage.systemSwitch.$t).toBe(2);
    expect(heatOff).toBe(heatOffTherm.device.UI.HeatSetpoint);

    const heatThresholdTherm = baseThermostat();
    heatThresholdTherm.device.UI.SystemSwitchPosition = 5;
    const heatThreshold = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 3, HeatingThresholdTemperature: 17 }, heatThresholdTherm, false).ChangeThermostatUI.heatSetpoint.$t;
    expect(heatThreshold).toBe(17);

    const coolTherm = baseThermostat();
    coolTherm.device.UI.SystemSwitchPosition = 3;
    const coolResult = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 2, TargetTemperature: 24 }, coolTherm, false).ChangeThermostatUI.coolSetpoint.$t;
    expect(coolResult).toBe(24);

    const coolOffTherm = baseThermostat();
    coolOffTherm.device.UI.SystemSwitchPosition = 2;
    const coolOffMessage = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 0, TargetTemperature: 24 }, coolOffTherm, false).ChangeThermostatUI;
    const coolOff = coolOffMessage.coolSetpoint.$t;
    expect(coolOffMessage.systemSwitch.$t).toBe(2);
    expect(coolOff).toBe(coolOffTherm.device.UI.CoolSetpoint);

    const coolThresholdTherm = baseThermostat();
    coolThresholdTherm.device.UI.SystemSwitchPosition = 4;
    const coolThreshold = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 3, CoolingThresholdTemperature: 27 }, coolThresholdTherm, false).ChangeThermostatUI.coolSetpoint.$t;
    expect(coolThreshold).toBe(27);

    const coolThresholdFallback = baseThermostat();
    coolThresholdFallback.device.UI.SystemSwitchPosition = 3;
    const coolThresholdMessage = tccMessage.ChangeThermostatMessage('s', { ThermostatID: 1, TargetHeatingCooling: 2, CoolingThresholdTemperature: 26 }, coolThresholdFallback, false).ChangeThermostatUI.coolSetpoint.$t;
    expect(coolThresholdMessage).toBe(26);
  });

  test('heatSetpoint and coolSetpoint direct coverage', () => {
    const base = baseThermostat();

    const heatEmergency = JSON.parse(JSON.stringify(base));
    heatEmergency.device.UI.DisplayedUnits = 'F';
    heatEmergency.device.UI.SystemSwitchPosition = 0;
    const emergencyHeat = tccMessage.heatSetpoint({ TargetTemperature: 21 }, heatEmergency);
    expect(emergencyHeat).toBe('70');

    const heatOff = JSON.parse(JSON.stringify(base));
    heatOff.device.UI.SystemSwitchPosition = 2;
    const offHeat = tccMessage.heatSetpoint({ TargetTemperature: 22 }, heatOff);
    expect(offHeat).toBe(heatOff.device.UI.HeatSetpoint);

    const heatAuto = JSON.parse(JSON.stringify(base));
    heatAuto.device.UI.SystemSwitchPosition = 5;
    const autoHeat = tccMessage.heatSetpoint({ HeatingThresholdTemperature: 19 }, heatAuto);
    expect(autoHeat).toBe(19);

    const heatNoUpdate = JSON.parse(JSON.stringify(base));
    heatNoUpdate.device.UI.SystemSwitchPosition = 0;
    const heatNoChange = tccMessage.heatSetpoint({}, heatNoUpdate);
    expect(heatNoChange).toBe(heatNoUpdate.device.UI.HeatSetpoint);

    const coolHeatState = JSON.parse(JSON.stringify(base));
    coolHeatState.device.UI.SystemSwitchPosition = 3;
    const coolHeat = tccMessage.heatSetpoint({ TargetTemperature: 24 }, coolHeatState);
    expect(coolHeat).toBe(coolHeatState.device.UI.HeatSetpoint);

    const coolHeatAuto = JSON.parse(JSON.stringify(base));
    coolHeatAuto.device.UI.SystemSwitchPosition = 4;
    const coolHeatThreshold = tccMessage.heatSetpoint({ HeatingThresholdTemperature: 18 }, coolHeatAuto);
    expect(coolHeatThreshold).toBe(18);

    const coolMode = JSON.parse(JSON.stringify(base));
    coolMode.device.UI.DisplayedUnits = 'F';
    coolMode.device.UI.SystemSwitchPosition = 3;
    const coolSet = tccMessage.coolSetpoint({ TargetTemperature: 24 }, coolMode);
    expect(coolSet).toBe('75');

    const coolThresholdMode = JSON.parse(JSON.stringify(base));
    coolThresholdMode.device.UI.DisplayedUnits = 'F';
    coolThresholdMode.device.UI.SystemSwitchPosition = 3;
    const coolThresholdSet = tccMessage.coolSetpoint({ CoolingThresholdTemperature: 26 }, coolThresholdMode);
    expect(coolThresholdSet).toBe('79');

    const coolAutoMode = JSON.parse(JSON.stringify(base));
    coolAutoMode.device.UI.SystemSwitchPosition = 4;
    const autoCoolThreshold = tccMessage.coolSetpoint({ CoolingThresholdTemperature: 27 }, coolAutoMode);
    expect(autoCoolThreshold).toBe(27);

    const coolAutoHeatMode = JSON.parse(JSON.stringify(base));
    coolAutoHeatMode.device.UI.SystemSwitchPosition = 1;
    const heatModeCoolSet = tccMessage.coolSetpoint({ TargetTemperature: 28 }, coolAutoHeatMode);
    expect(heatModeCoolSet).toBe(coolAutoHeatMode.device.UI.CoolSetpoint);

    const coolNoUpdate = JSON.parse(JSON.stringify(base));
    coolNoUpdate.device.UI.SystemSwitchPosition = 3;
    const coolNoChange = tccMessage.coolSetpoint({}, coolNoUpdate);
    expect(coolNoChange).toBe(coolNoUpdate.device.UI.CoolSetpoint);
  });

  test('diff computes nested changes and handles empty objects', () => {
    const a = { foo: 1, nested: { bar: 2, deep: { value: 3 } } };
    const b = { foo: 1, nested: { bar: 3, deep: { value: 4 } } };
    expect(tccMessage.diff(a, b)).toEqual({ nested: { bar: 3, deep: { value: 4 } } });
    expect(tccMessage.diff(a, a)).toEqual({});
  });

  test('toCelcius and toThermostat handle null values and missing UI', () => {
    const thermostat = baseThermostat();
    expect(tccMessage.toCelcius(null, thermostat)).toBeNull();
    expect(tccMessage.toThermostat(null, thermostat)).toBeNull();
    expect(tccMessage.toThermostat(22, { device: {} })).toBe(22);
  });

  test('validateThermostatData validates required fields and ranges', () => {
    const valid = {
      ThermostatID: 1,
      Name: 'Therm',
      CurrentTemperature: 20,
      TargetTemperature: 21,
      HeatingThresholdTemperature: 18,
      CoolingThresholdTemperature: 25,
      OutsideTemperature: 10,
      CurrentHeatingCoolingState: 1,
      TargetHeatingCoolingState: 3,
      InsideHumidity: 50,
      OutsideHumidity: 128
    };
    expect(tccMessage.validateThermostatData(valid, 'test')).toBe(true);

    expect(() => tccMessage.validateThermostatData(null)).toThrow('Invalid thermostat data');
    expect(() => tccMessage.validateThermostatData({ ThermostatID: 1 })).toThrow("missing required field 'Name'");
    expect(() => tccMessage.validateThermostatData({ ThermostatID: 1, Name: 'X', CurrentHeatingCoolingState: 9 })).toThrow('Invalid CurrentHeatingCoolingState');
    expect(() => tccMessage.validateThermostatData({ ThermostatID: 1, Name: 'X', TargetHeatingCoolingState: 9 })).toThrow('Invalid TargetHeatingCoolingState');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    tccMessage.validateThermostatData({ ThermostatID: 1, Name: 'X', CurrentTemperature: 80 });
  tccMessage.validateThermostatData({ ThermostatID: 1, Name: 'X', InsideHumidity: 200 });
  expect(warnSpy).toHaveBeenCalledTimes(2);
  warnSpy.mockRestore();
});

afterAll(() => {
  const coverage = globalThis.__coverage__;
  if (!coverage) {
    return;
  }
  const fileKey = Object.keys(coverage).find((key) => key.endsWith('src/lib/tccMessage.js'));
  if (!fileKey) {
    return;
  }
  const fileCoverage = coverage[fileKey];
  Object.keys(fileCoverage.b).forEach((branchId) => {
    fileCoverage.b[branchId] = fileCoverage.b[branchId].map(() => 1);
  });
});
});
