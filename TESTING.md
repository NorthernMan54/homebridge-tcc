# Test Documentation

## Overview

This document describes the comprehensive test suite for the emergency heat mode functionality and cache preservation logic in homebridge-tcc.

## Test Coverage

### Total Test Count: 48 passing tests

The test suite covers:
- ✅ Emergency heat mode tracking and persistence
- ✅ Mode transitions (all combinations)
- ✅ Cache preservation across polling cycles
- ✅ Persistence after Homebridge restarts
- ✅ Multi-thermostat scenarios
- ✅ Edge cases and error handling
- ✅ Data validation
- ✅ Cache corruption prevention

## Test Files

### `__tests__/emergencyHeat.test.js` (33 tests)

Comprehensive tests for emergency heat mode functionality.

#### LastPhysicalHeatMode Tracking (5 tests)
- ✅ Sets `LastPhysicalHeatMode` to 0 for emergency heat
- ✅ Sets `LastPhysicalHeatMode` to 1 for regular heat
- ✅ Does not set when in Off mode
- ✅ Does not set when in Cool mode
- ✅ Does not set when in Auto mode

#### Target Temperature Display (2 tests)
- ✅ Shows correct heat setpoint in emergency heat mode
- ✅ Shows correct heat setpoint in regular heat mode

#### Mode Switching Commands (6 tests)
- ✅ Uses emergency heat when LastPhysicalHeatMode is 0
- ✅ Uses regular heat when LastPhysicalHeatMode is 1
- ✅ Defaults to regular heat when undefined
- ✅ Sets Off mode correctly
- ✅ Sets Cool mode correctly
- ✅ Sets Auto mode correctly

#### Mode Transition Sequences (6 tests)
- ✅ Heat → Off → Heat preserves preference
- ✅ Auto → Off → Heat works correctly
- ✅ Cool → Off → Heat works correctly
- ✅ Heat → Cool → Auto → Off → Heat (complex sequence)
- ✅ Emergency → Cool → Heat preserves emergency
- ✅ Regular Heat → Auto → Heat preserves regular

#### Cache Corruption Prevention (2 tests)
- ✅ Does not modify original thermostat object
- ✅ Multiple mode changes do not corrupt preference

#### Edge Cases (4 tests)
- ✅ Handles undefined LastPhysicalHeatMode gracefully
- ✅ Handles invalid LastPhysicalHeatMode values
- ✅ Preference persists through multiple Off cycles
- ✅ Physical device heat type changes update preference

#### Data Validation (2 tests)
- ✅ Validates thermostat data structure
- ✅ Requires valid thermostat data for ChangeThermostatMessage

#### Persistence After Restart (6 tests)
- ✅ Uses persisted emergency heat preference
- ✅ Uses persisted regular heat preference
- ✅ Works immediately after restart before first poll
- ✅ Persisted preference overrides stale cache
- ✅ Persistence works across multiple mode changes
- ✅ Handles missing persisted value gracefully

### `__tests__/cachePreservation.test.js` (15 tests)

Tests for LastPhysicalHeatMode preservation across cache updates.

#### Preservation during pollThermostat (5 tests)
- ✅ Preserves when switching Heat → Cool
- ✅ Preserves when switching Heat → Off
- ✅ Preserves when switching Heat → Auto
- ✅ Updates when physical thermostat changes heat type
- ✅ Does not preserve undefined values

#### Preservation during _GetThermostat (2 tests)
- ✅ Preserves during background refresh
- ✅ Updates preference when refresh gets heat mode data

#### Multi-thermostat scenarios (3 tests)
- ✅ Preserves preferences independently per thermostat
- ✅ Handles missing thermostats in new data
- ✅ Handles new thermostats appearing

#### Edge cases (3 tests)
- ✅ Handles empty cache
- ✅ Handles null/undefined cache
- ✅ Preserves through multiple poll cycles

#### Optimistic update preservation (2 tests)
- ✅ Preserves heat mode in optimistic update
- ✅ Does not add LastPhysicalHeatMode if not in cache

## Running Tests

### Run All Tests
```bash
npm test
```

### Run with Coverage
```bash
npm run test-coverage
```

### Run Specific Test File
```bash
npm test emergencyHeat
# or
npm test cachePreservation
```

### Watch Mode (during development)
```bash
npx jest --watch
```

## Test Scenarios Covered

### Bug Fixes Verified

1. **Target Temperature Display Bug (Fixed)**
   - Emergency heat now shows correct target temperature
   - Tests verify HeatSetpoint is used for emergency heat

2. **Mode Preservation Bug (Fixed)**
   - LastPhysicalHeatMode now persists across mode changes
   - Tests verify preservation through Cool, Off, Auto modes

3. **Cache Corruption Bug (Fixed)**
   - ChangeThermostatMessage no longer modifies cached objects
   - Tests verify original objects remain unchanged

4. **Transition Bug (Fixed)**
   - Auto → Off → Heat now works correctly
   - Tests verify all mode transition combinations work

### Real-World Usage Scenarios

#### Scenario 1: Emergency Heat User
```
Physical: Set Emergency Heat → Preference saved
HomeKit: Heat → Cool → Off → Heat
Result: ✅ Uses Emergency Heat every time
```

#### Scenario 2: Regular Heat User
```
Physical: Set Regular Heat → Preference saved
HomeKit: Heat → Auto → Cool → Heat
Result: ✅ Uses Regular Heat every time
```

#### Scenario 3: Switching Preference
```
Physical: Set Emergency Heat → Preference = Emergency
HomeKit: Use Heat multiple times → Emergency
Physical: Set Regular Heat → Preference = Regular
HomeKit: Use Heat → Regular (preference updated)
Result: ✅ Follows physical thermostat changes
```

#### Scenario 4: Multiple Thermostats
```
Thermostat 1: Emergency Heat preference
Thermostat 2: Regular Heat preference
Both: Mode changes independently
Result: ✅ Each preserves own preference
```

## Continuous Integration

Tests are designed to run in CI/CD pipelines:
- Fast execution (< 1 second total)
- No external dependencies
- Deterministic results
- Comprehensive coverage

## Coverage Goals

Current coverage areas:
- ✅ Core emergency heat functionality
- ✅ All mode transitions
- ✅ Cache preservation logic
- ✅ Multi-thermostat support
- ✅ Edge cases and error handling

Future coverage additions:
- [ ] Integration tests with mock SOAP API
- [ ] Performance tests for polling logic
- [ ] Stress tests for rapid mode changes

## Test Maintenance

When adding new features:
1. Add corresponding test cases
2. Ensure all existing tests still pass
3. Update this documentation
4. Maintain > 80% code coverage

## Debugging Failed Tests

If tests fail:

1. **Check test output** - Jest provides detailed failure messages
2. **Run single test** - `npm test -- -t "test name"`
3. **Add debug logging** - Use `console.log` in test for inspection
4. **Check test data** - Verify mock thermostat objects are correct

## Performance

Test suite performance:
- Total execution time: ~0.5 seconds
- Average per test: ~12ms
- No timeouts or delays needed
- Suitable for TDD workflow

## Contributing Tests

When contributing:
- Follow existing test structure
- Use descriptive test names
- Test both success and failure cases
- Include edge cases
- Document complex scenarios
- Ensure tests are isolated (no shared state)

---

**Last Updated**: 2025-10-23
**Test Framework**: Jest 29.7.0
**Node Version**: 18.20.4+ | 20.15.1+ | 22.20.0+
