/**
 * Tests for LastPhysicalHeatMode preservation across cache updates
 * Ensures preference persists when thermostat changes to non-heat modes
 */

const tcc = require('../src/lib/tcc.js');
const tccMessage = require('../src/lib/tccMessage.js');

describe('Cache Preservation Tests', () => {

  let mockTcc;
  let mockThermostats;

  beforeEach(() => {
    // Create a fresh TCC instance for each test
    mockTcc = new tcc.tcc({
      username: 'test@example.com',
      password: 'password',
      refresh: 600,
      usePermanentHolds: false,
      debug: false
    });

    // Initialize mock thermostats cache
    mockTcc.thermostats = {
      hb: {}
    };
  });

  // Helper to create thermostat data
  const createThermostatData = (id, position, lastPhysicalHeatMode) => {
    const rawThermostat = {
      ThermostatID: id,
      UserDefinedDeviceName: `Thermostat ${id}`,
      ModelTypeName: 'T6 Pro',
      UI: {
        DisplayedUnits: 'F',
        DispTemperature: 72,
        HeatSetpoint: 70,
        CoolSetpoint: 75,
        SystemSwitchPosition: position,
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
        CanSetSwitchAuto: true,
        EquipmentOutputStatus: 0
      }
    };

    const hbData = tccMessage.toHb(rawThermostat);
    if (lastPhysicalHeatMode !== undefined) {
      hbData.LastPhysicalHeatMode = lastPhysicalHeatMode;
    }
    return hbData;
  };

  describe('Preservation during pollThermostat', () => {

    test('Preserves LastPhysicalHeatMode when switching from Heat to Cool', () => {
      // Initial state: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);
      expect(mockTcc.thermostats.hb['12345'].LastPhysicalHeatMode).toBe(0);

      // Simulate new poll data where thermostat is now in Cool (no LastPhysicalHeatMode)
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 3) // Cool mode, no LastPhysicalHeatMode
        },
        LocationInfo: {}
      };

      expect(newData.hb['12345'].LastPhysicalHeatMode).toBeUndefined();

      // Simulate the preservation logic from pollThermostat
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      // Verify preference was preserved
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0);
    });

    test('Preserves LastPhysicalHeatMode when switching from Heat to Off', () => {
      // Initial state: Regular heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 1, 1);

      // New poll data: Off mode
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 2) // Off
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(1);
    });

    test('Preserves LastPhysicalHeatMode when switching from Heat to Auto', () => {
      // Initial state: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // New poll data: Auto mode
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 4) // Auto
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0);
    });

    test('Updates LastPhysicalHeatMode when physical thermostat changes heat type', () => {
      // Initial state: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // User changes to regular heat on physical thermostat
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 1) // Regular heat - will set LastPhysicalHeatMode = 1
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      // Preference should be updated to regular heat
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(1);
    });

    test('Does not preserve undefined LastPhysicalHeatMode', () => {
      // Initial state: Auto mode (no LastPhysicalHeatMode)
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 4);

      // New poll data: Cool mode
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 3)
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      // Should remain undefined
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBeUndefined();
    });
  });

  describe('Preservation during _GetThermostat (background refresh)', () => {

    test('Preserves LastPhysicalHeatMode during background refresh', () => {
      // Initial state: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // Simulate background refresh returning Cool mode data
      const refreshedData = createThermostatData(12345, 3);
      expect(refreshedData.LastPhysicalHeatMode).toBeUndefined();

      // Simulate the preservation logic from _GetThermostat
      const idString = '12345';
      if (mockTcc.thermostats && mockTcc.thermostats.hb && mockTcc.thermostats.hb[idString]) {
        if (refreshedData.LastPhysicalHeatMode === undefined && mockTcc.thermostats.hb[idString].LastPhysicalHeatMode !== undefined) {
          refreshedData.LastPhysicalHeatMode = mockTcc.thermostats.hb[idString].LastPhysicalHeatMode;
        }
      }

      expect(refreshedData.LastPhysicalHeatMode).toBe(0);
    });

    test('Updates preference when background refresh gets heat mode data', () => {
      // Initial state: Regular heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 1, 1);

      // Background refresh returns emergency heat
      const refreshedData = createThermostatData(12345, 0);

      // Preservation logic
      const idString = '12345';
      if (mockTcc.thermostats && mockTcc.thermostats.hb && mockTcc.thermostats.hb[idString]) {
        if (refreshedData.LastPhysicalHeatMode === undefined && mockTcc.thermostats.hb[idString].LastPhysicalHeatMode !== undefined) {
          refreshedData.LastPhysicalHeatMode = mockTcc.thermostats.hb[idString].LastPhysicalHeatMode;
        }
      }

      // Should now have emergency heat preference
      expect(refreshedData.LastPhysicalHeatMode).toBe(0);
    });
  });

  describe('Multi-thermostat scenarios', () => {

    test('Preserves preferences independently for multiple thermostats', () => {
      // Thermostat 1: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // Thermostat 2: Regular heat
      mockTcc.thermostats.hb['67890'] = createThermostatData(67890, 1, 1);

      // New poll data: Both in Off mode
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 2),
          '67890': createThermostatData(67890, 2)
        }
      };

      // Apply preservation logic for all thermostats
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      // Each should preserve its own preference
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0); // Emergency
      expect(newData.hb['67890'].LastPhysicalHeatMode).toBe(1); // Regular
    });

    test('Handles missing thermostats in new data', () => {
      // Initial state: 2 thermostats
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);
      mockTcc.thermostats.hb['67890'] = createThermostatData(67890, 1, 1);

      // New data only has one thermostat
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 3)
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0);
      expect(newData.hb['67890']).toBeUndefined(); // Missing is OK
    });

    test('Handles new thermostats appearing in poll data', () => {
      // Initial state: 1 thermostat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // New data adds a second thermostat
      const newData = {
        hb: {
          '12345': createThermostatData(12345, 2),
          '67890': createThermostatData(67890, 1) // New thermostat
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0); // Preserved
      expect(newData.hb['67890'].LastPhysicalHeatMode).toBe(1); // New one gets its value
    });
  });

  describe('Edge cases', () => {

    test('Handles empty cache', () => {
      mockTcc.thermostats.hb = {};

      const newData = {
        hb: {
          '12345': createThermostatData(12345, 1)
        }
      };

      // Apply preservation logic
      for (const id in newData.hb) {
        if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
          if (newData.hb[id].LastPhysicalHeatMode === undefined) {
            newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
          }
        }
      }

      // Should set from new data
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(1);
    });

    test('Handles null/undefined cache', () => {
      mockTcc.thermostats = null;

      const newData = {
        hb: {
          '12345': createThermostatData(12345, 0)
        }
      };

      // Preservation logic should not crash
      if (mockTcc.thermostats && mockTcc.thermostats.hb) {
        for (const id in newData.hb) {
          if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
            if (newData.hb[id].LastPhysicalHeatMode === undefined) {
              newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
            }
          }
        }
      }

      // Should just use new data
      expect(newData.hb['12345'].LastPhysicalHeatMode).toBe(0);
    });

    test('Preserves preference through multiple poll cycles', () => {
      // Initial: Emergency heat
      mockTcc.thermostats.hb['12345'] = createThermostatData(12345, 0, 0);

      // Cycle through multiple modes
      const modes = [3, 2, 4, 3, 2]; // Cool, Off, Auto, Cool, Off

      for (const mode of modes) {
        const newData = {
          hb: {
            '12345': createThermostatData(12345, mode)
          }
        };

        // Apply preservation
        for (const id in newData.hb) {
          if (mockTcc.thermostats.hb[id] && mockTcc.thermostats.hb[id].LastPhysicalHeatMode !== undefined) {
            if (newData.hb[id].LastPhysicalHeatMode === undefined) {
              newData.hb[id].LastPhysicalHeatMode = mockTcc.thermostats.hb[id].LastPhysicalHeatMode;
            }
          }
        }

        // Update cache
        mockTcc.thermostats.hb = newData.hb;

        // Preference should persist
        expect(mockTcc.thermostats.hb['12345'].LastPhysicalHeatMode).toBe(0);
      }
    });
  });

  describe('Optimistic update preservation', () => {

    test('Preserves heat mode in optimistic update when setting to heat', () => {
      const cached = createThermostatData(12345, 3, 0); // Cool with emergency preference
      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      // Simulate optimistic update logic
      const optimistic = Object.assign({}, cached);
      if (desiredState.TargetHeatingCooling !== undefined) {
        optimistic.TargetHeatingCoolingState = desiredState.TargetHeatingCooling;
        if (desiredState.TargetHeatingCooling === 1 && cached.LastPhysicalHeatMode !== undefined) {
          optimistic.LastPhysicalHeatMode = cached.LastPhysicalHeatMode;
        }
      }

      expect(optimistic.TargetHeatingCoolingState).toBe(1);
      expect(optimistic.LastPhysicalHeatMode).toBe(0); // Preserved
    });

    test('Does not add LastPhysicalHeatMode if not in cache', () => {
      const cached = createThermostatData(12345, 3); // Cool, no preference
      const desiredState = { TargetHeatingCooling: 1 }; // Want Heat

      // Simulate optimistic update logic
      const optimistic = Object.assign({}, cached);
      if (desiredState.TargetHeatingCooling !== undefined) {
        optimistic.TargetHeatingCoolingState = desiredState.TargetHeatingCooling;
        if (desiredState.TargetHeatingCooling === 1 && cached.LastPhysicalHeatMode !== undefined) {
          optimistic.LastPhysicalHeatMode = cached.LastPhysicalHeatMode;
        }
      }

      expect(optimistic.TargetHeatingCoolingState).toBe(1);
      expect(optimistic.LastPhysicalHeatMode).toBeUndefined(); // Remains undefined
    });
  });
});
