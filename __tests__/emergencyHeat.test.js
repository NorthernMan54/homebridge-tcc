/**
 * Comprehensive tests for emergency heat mode functionality
 * Tests emergency heat tracking, persistence, and all mode transitions
 */

const tccMessage = require('../src/lib/tccMessage.js');

describe('Emergency Heat Mode Tests', () => {

  // Helper to create a mock thermostat object
  const createMockThermostat = (systemSwitchPosition, lastPhysicalHeatMode) => {
    const thermostat = {
      ThermostatID: 12345,
      UserDefinedDeviceName: 'Test Thermostat',
      ModelTypeName: 'T6 Pro',
      UI: {
        DisplayedUnits: 'F',
        DispTemperature: 72,
        HeatSetpoint: 70,
        CoolSetpoint: 75,
        SystemSwitchPosition: systemSwitchPosition,
        EquipmentOutputStatus: 0,
        OutdoorTemp: 65,
        OutdoorHumidity: 45,
        IndoorHumidity: 40,
        HeatLowerSetptLimit: 40,
        HeatUpperSetptLimit: 90,
        CoolLowerSetptLimit: 50,
        CoolUpperSetptLimit: 99,
        HeatNextPeriod: 0,
        CoolNextPeriod: 0,
        CanSetSwitchOff: true,
        CanSetSwitchHeat: true,
        CanSetSwitchCool: true,
        CanSetSwitchAuto: true
      }
    };

    const hbData = tccMessage.toHb(thermostat);
    if (lastPhysicalHeatMode !== undefined) {
      hbData.LastPhysicalHeatMode = lastPhysicalHeatMode;
    }
    return hbData;
  };

  describe('LastPhysicalHeatMode Tracking', () => {

    test('Sets LastPhysicalHeatMode to 0 when physical thermostat is in emergency heat', () => {
      const thermostat = createMockThermostat(0); // Emergency heat
      expect(thermostat.LastPhysicalHeatMode).toBe(0);
    });

    test('Sets LastPhysicalHeatMode to 1 when physical thermostat is in regular heat', () => {
      const thermostat = createMockThermostat(1); // Regular heat
      expect(thermostat.LastPhysicalHeatMode).toBe(1);
    });

    test('Does not set LastPhysicalHeatMode when in Off mode', () => {
      const thermostat = createMockThermostat(2); // Off
      expect(thermostat.LastPhysicalHeatMode).toBeUndefined();
    });

    test('Does not set LastPhysicalHeatMode when in Cool mode', () => {
      const thermostat = createMockThermostat(3); // Cool
      expect(thermostat.LastPhysicalHeatMode).toBeUndefined();
    });

    test('Does not set LastPhysicalHeatMode when in Auto mode', () => {
      const thermostat = createMockThermostat(4); // Auto heat
      expect(thermostat.LastPhysicalHeatMode).toBeUndefined();
    });
  });

  describe('Target Temperature Display', () => {

    test('Shows heat setpoint when in emergency heat mode', () => {
      const rawThermostat = {
        ThermostatID: 12345,
        UserDefinedDeviceName: 'Test',
        ModelTypeName: 'T6',
        UI: {
          DisplayedUnits: 'F',
          DispTemperature: 72,
          HeatSetpoint: 70,
          CoolSetpoint: 75,
          SystemSwitchPosition: 0, // Emergency heat
          OutdoorTemp: 65,
          OutdoorHumidity: 45,
          IndoorHumidity: 40,
          HeatLowerSetptLimit: 40,
          HeatUpperSetptLimit: 90,
          CoolLowerSetptLimit: 50,
          CoolUpperSetptLimit: 99,
          CanSetSwitchOff: true,
          CanSetSwitchHeat: true,
          CanSetSwitchCool: true,
          CanSetSwitchAuto: false
        }
      };

      const hbData = tccMessage.toHb(rawThermostat);
      // Target temp should be heat setpoint (converted to Celsius)
      const expectedCelsius = parseFloat(((70 - 32) * 5 / 9).toFixed(1));
      expect(hbData.TargetTemperature).toBe(expectedCelsius);
    });

    test('Shows heat setpoint when in regular heat mode', () => {
      const rawThermostat = {
        ThermostatID: 12345,
        UserDefinedDeviceName: 'Test',
        ModelTypeName: 'T6',
        UI: {
          DisplayedUnits: 'F',
          DispTemperature: 72,
          HeatSetpoint: 70,
          CoolSetpoint: 75,
          SystemSwitchPosition: 1, // Regular heat
          OutdoorTemp: 65,
          OutdoorHumidity: 45,
          IndoorHumidity: 40,
          HeatLowerSetptLimit: 40,
          HeatUpperSetptLimit: 90,
          CoolLowerSetptLimit: 50,
          CoolUpperSetptLimit: 99,
          CanSetSwitchOff: true,
          CanSetSwitchHeat: true,
          CanSetSwitchCool: true,
          CanSetSwitchAuto: false
        }
      };

      const hbData = tccMessage.toHb(rawThermostat);
      const expectedCelsius = parseFloat(((70 - 32) * 5 / 9).toFixed(1));
      expect(hbData.TargetTemperature).toBe(expectedCelsius);
    });
  });

  describe('Mode Switching Commands', () => {

    test('Uses emergency heat (0) when LastPhysicalHeatMode is 0', () => {
      const thermostat = createMockThermostat(3, 0); // Currently Cool, last heat was emergency
      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Emergency heat
    });

    test('Uses regular heat (1) when LastPhysicalHeatMode is 1', () => {
      const thermostat = createMockThermostat(3, 1); // Currently Cool, last heat was regular
      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1); // Regular heat
    });

    test('Defaults to regular heat (1) when LastPhysicalHeatMode is undefined', () => {
      const thermostat = createMockThermostat(3); // Currently Cool, no heat preference
      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1); // Regular heat (default)
    });

    test('Sets Off mode correctly', () => {
      const thermostat = createMockThermostat(1, 1);
      const desiredState = { TargetHeatingCooling: 0 }; // Want Off

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2); // TCC Off = 2
    });

    test('Sets Cool mode correctly', () => {
      const thermostat = createMockThermostat(1, 1);
      const desiredState = { TargetHeatingCooling: 2 }; // Want Cool

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(3); // TCC Cool = 3
    });

    test('Sets Auto mode correctly', () => {
      const thermostat = createMockThermostat(1, 1);
      const desiredState = { TargetHeatingCooling: 3 }; // Want Auto

      const message = tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        thermostat,
        false
      );

      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(4); // TCC Auto = 4
    });
  });

  describe('Mode Transition Sequences', () => {

    test('Heat → Off → Heat: Preserves heat mode preference', () => {
      let thermostat = createMockThermostat(0, 0); // Emergency heat

      // Switch to Off
      let desiredState = { TargetHeatingCooling: 0 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2); // Off

      // Simulate thermostat now in Off, but preserve emergency heat preference
      thermostat = createMockThermostat(2, 0);

      // Switch back to Heat
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Emergency heat restored
    });

    test('Auto → Off → Heat: Works correctly with preserved preference', () => {
      // Start in Auto, but previously used emergency heat
      let thermostat = createMockThermostat(4, 0);

      // Switch to Off
      let desiredState = { TargetHeatingCooling: 0 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2); // Off

      // Simulate thermostat now in Off, preserve emergency heat preference
      thermostat = createMockThermostat(2, 0);

      // Switch to Heat - should use emergency heat
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Emergency heat
    });

    test('Cool → Off → Heat: Works correctly', () => {
      let thermostat = createMockThermostat(3, 1); // Cool, last heat was regular

      // Switch to Off
      let desiredState = { TargetHeatingCooling: 0 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2); // Off

      // Simulate thermostat in Off, preserve regular heat preference
      thermostat = createMockThermostat(2, 1);

      // Switch to Heat - should use regular heat
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1); // Regular heat
    });

    test('Heat → Cool → Auto → Off → Heat: Complex sequence works', () => {
      let thermostat = createMockThermostat(0, 0); // Start with emergency heat

      // Heat → Cool
      let desiredState = { TargetHeatingCooling: 2 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(3); // Cool

      thermostat = createMockThermostat(3, 0); // Now in Cool, preserve emergency

      // Cool → Auto
      desiredState = { TargetHeatingCooling: 3 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(4); // Auto

      thermostat = createMockThermostat(4, 0); // Now in Auto, preserve emergency

      // Auto → Off
      desiredState = { TargetHeatingCooling: 0 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2); // Off

      thermostat = createMockThermostat(2, 0); // Now in Off, preserve emergency

      // Off → Heat (should use emergency heat)
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Emergency heat restored!
    });

    test('Emergency → Cool → Heat: Preserves emergency heat', () => {
      let thermostat = createMockThermostat(0, 0); // Emergency heat

      // Switch to Cool
      let desiredState = { TargetHeatingCooling: 2 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(3); // Cool

      thermostat = createMockThermostat(3, 0); // Now in Cool, preserve emergency

      // Switch back to Heat
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Emergency heat
    });

    test('Regular Heat → Auto → Heat: Preserves regular heat', () => {
      let thermostat = createMockThermostat(1, 1); // Regular heat

      // Switch to Auto
      let desiredState = { TargetHeatingCooling: 3 };
      let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(4); // Auto

      thermostat = createMockThermostat(4, 1); // Now in Auto, preserve regular

      // Switch back to Heat
      desiredState = { TargetHeatingCooling: 1 };
      message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1); // Regular heat
    });
  });

  describe('Cache Corruption Prevention', () => {

    test('Does not modify original thermostat object during ChangeThermostatMessage', () => {
      const originalThermostat = createMockThermostat(3, 0);
      const originalPosition = originalThermostat.device.UI.SystemSwitchPosition;

      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      tccMessage.ChangeThermostatMessage(
        'test-session',
        desiredState,
        originalThermostat,
        false
      );

      // Original thermostat should NOT be modified
      expect(originalThermostat.device.UI.SystemSwitchPosition).toBe(originalPosition);
    });

    test('Multiple mode changes do not corrupt preference', () => {
      let thermostat = createMockThermostat(0, 0); // Emergency heat
      const originalPreference = thermostat.LastPhysicalHeatMode;

      // Make several mode changes
      for (let i = 0; i < 5; i++) {
        const desiredState = { TargetHeatingCooling: i % 3 }; // Cycle Off, Heat, Cool
        tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);

        // Preference should remain unchanged
        expect(thermostat.LastPhysicalHeatMode).toBe(originalPreference);
      }
    });
  });

  describe('Edge Cases', () => {

    test('Handles undefined LastPhysicalHeatMode gracefully', () => {
      const thermostat = createMockThermostat(2); // Off, no preference
      expect(thermostat.LastPhysicalHeatMode).toBeUndefined();

      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat
      const message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);

      // Should default to regular heat (1)
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1);
    });

    test('Handles invalid LastPhysicalHeatMode values', () => {
      const thermostat = createMockThermostat(2);
      thermostat.LastPhysicalHeatMode = 99; // Invalid value

      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat
      const message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);

      // Should ignore invalid value and default to regular heat
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1);
    });

    test('Preference persists through multiple Off cycles', () => {
      let thermostat = createMockThermostat(0, 0); // Emergency heat

      // Heat → Off → Heat → Off → Heat
      for (let i = 0; i < 3; i++) {
        // To Off
        let desiredState = { TargetHeatingCooling: 0 };
        let message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
        expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(2);
        thermostat = createMockThermostat(2, 0); // Off but preserve emergency

        // Back to Heat
        desiredState = { TargetHeatingCooling: 1 };
        message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
        expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(0); // Still emergency heat
        thermostat = createMockThermostat(0, 0); // Back to emergency
      }
    });

    test('Switching from emergency to regular heat on physical device updates preference', () => {
      // User sets emergency heat on physical device
      let thermostat = createMockThermostat(0, 0);
      expect(thermostat.LastPhysicalHeatMode).toBe(0);

      // User later sets regular heat on physical device
      thermostat = createMockThermostat(1);
      expect(thermostat.LastPhysicalHeatMode).toBe(1); // Preference updated

      // Now HomeKit Heat command should use regular heat
      const desiredState = { TargetHeatingCooling: 1 };
      const message = tccMessage.ChangeThermostatMessage('test-session', desiredState, thermostat, false);
      expect(message.ChangeThermostatUI.systemSwitch.$t).toBe(1); // Regular heat
    });
  });

  describe('Data Validation', () => {

    test('toHb validates thermostat data structure', () => {
      const validThermostat = {
        ThermostatID: 12345,
        UserDefinedDeviceName: 'Test',
        ModelTypeName: 'T6',
        UI: {
          DisplayedUnits: 'F',
          DispTemperature: 72,
          HeatSetpoint: 70,
          CoolSetpoint: 75,
          SystemSwitchPosition: 1,
          OutdoorTemp: 65,
          OutdoorHumidity: 45,
          IndoorHumidity: 40,
          HeatLowerSetptLimit: 40,
          HeatUpperSetptLimit: 90,
          CoolLowerSetptLimit: 50,
          CoolUpperSetptLimit: 99,
          CanSetSwitchOff: true,
          CanSetSwitchHeat: true,
          CanSetSwitchCool: true,
          CanSetSwitchAuto: false
        }
      };

      const result = tccMessage.toHb(validThermostat);

      // Validate result has expected fields
      expect(result).toHaveProperty('ThermostatID');
      expect(result).toHaveProperty('Name');
      expect(result).toHaveProperty('CurrentTemperature');
      expect(result).toHaveProperty('TargetTemperature');
      expect(result).toHaveProperty('LastPhysicalHeatMode');
      expect(result).toHaveProperty('device');

      // Validate thermostat data integrity
      expect(() => {
        tccMessage.validateThermostatData(result, 'test');
      }).not.toThrow();
    });

    test('ChangeThermostatMessage requires valid thermostat data', () => {
      expect(() => {
        tccMessage.ChangeThermostatMessage('session', {}, null, false);
      }).toThrow('Invalid thermostat data');

      expect(() => {
        tccMessage.ChangeThermostatMessage('session', {}, {}, false);
      }).toThrow('Invalid thermostat data');

      expect(() => {
        tccMessage.ChangeThermostatMessage('session', {}, { device: {} }, false);
      }).toThrow('Invalid thermostat data');
    });
  });
});
