const tccMessage = require('../src/lib/tccMessage.js');

describe('Humidity Mapping', () => {
  test('Indoor humidity is forwarded to HomeKit payload', () => {
    const thermostat = {
      ThermostatID: 42,
      UserDefinedDeviceName: 'Living Room',
      ModelTypeName: 'T6',
      UI: {
        DisplayedUnits: 'C',
        DispTemperature: 21,
        HeatSetpoint: 20,
        CoolSetpoint: 25,
        SystemSwitchPosition: 1,
        OutdoorTemp: 10,
        OutdoorHumidity: 55,
        IndoorHumidity: 40,
        HeatLowerSetptLimit: 10,
        HeatUpperSetptLimit: 30,
        CoolLowerSetptLimit: 15,
        CoolUpperSetptLimit: 32,
        CanSetSwitchOff: true,
        CanSetSwitchHeat: true,
        CanSetSwitchCool: true,
        CanSetSwitchAuto: true,
        HeatNextPeriod: 19,
        CoolNextPeriod: 26
      },
      EquipmentStatus: 'Off'
    };

    const hb = tccMessage.toHb(thermostat);
    expect(hb.InsideHumidity).toBe(40);
  });

  test('Indoor humidity placeholder (128) is preserved for downstream logic', () => {
    const thermostat = {
      ThermostatID: 43,
      UserDefinedDeviceName: 'Bedroom',
      ModelTypeName: 'T6',
      UI: {
        DisplayedUnits: 'F',
        DispTemperature: 72,
        HeatSetpoint: 70,
        CoolSetpoint: 75,
        SystemSwitchPosition: 1,
        OutdoorTemp: 50,
        OutdoorHumidity: 40,
        IndoorHumidity: 128,
        HeatLowerSetptLimit: 40,
        HeatUpperSetptLimit: 90,
        CoolLowerSetptLimit: 50,
        CoolUpperSetptLimit: 95,
        CanSetSwitchOff: true,
        CanSetSwitchHeat: true,
        CanSetSwitchCool: true,
        CanSetSwitchAuto: true,
        HeatNextPeriod: 68,
        CoolNextPeriod: 74
      },
      EquipmentStatus: 'Off'
    };

    const hb = tccMessage.toHb(thermostat);
    expect(hb.InsideHumidity).toBe(128);
  });
});
