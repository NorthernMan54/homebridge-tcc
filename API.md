# API Documentation

> **homebridge-tcc** - Developer API Reference
> Version: 1.0.0-beta.0

This document provides detailed API documentation for developers who want to extend or integrate with the homebridge-tcc plugin.

## Table of Contents

- [Platform API](#platform-api)
- [TCC API Client](#tcc-api-client)
- [Message Builder API](#message-builder-api)
- [Accessories API](#accessories-api)
- [Handlers API](#handlers-api)
- [Helpers API](#helpers-api)
- [Logger API](#logger-api)
- [Type Definitions](#type-definitions)

---

## Platform API

### TccPlatform

Main platform class that coordinates the plugin.

#### Constructor

```javascript
constructor(log, config, api)
```

**Parameters**:
- `log` (Function): Homebridge logging function
- `config` (Object): Platform configuration
- `api` (API): Homebridge API instance

**Configuration Object**:
```javascript
{
  platform: 'tcc',
  name: string,
  username: string,          // Required: TCC account email
  password: string,          // Required: TCC account password
  refresh: number,           // Optional: Main poll interval (default: 600)
  backgroundRefresh: number, // Optional: Fast poll interval (default: 180)
  usePermanentHolds: boolean,// Optional: Permanent vs temporary holds
  sensors: string,           // Optional: 'none'|'all'|'inside'|'insideHumidity'|'outside'
  storage: string,           // Optional: 'fs'|'googleDrive'
  debug: boolean             // Optional: Enable debug logging
}
```

#### Methods

##### `didFinishLaunching()`

Called when Homebridge has finished launching.

**Returns**: `void`

**Description**: Initializes TCC client, performs initial poll, creates accessories, starts polling intervals.

---

##### `configureAccessory(accessory)`

Called to restore cached accessories on restart.

**Parameters**:
- `accessory` (PlatformAccessory): Cached accessory to configure

**Returns**: `void`

**Description**: Rebinds handlers, restores services, recreates helpers.

---

##### `pollDevices()`

Main polling cycle for all thermostats.

**Returns**: `Promise<Object>` - Devices data

**Description**: Fetches all thermostat data, updates all accessories, handles errors gracefully.

**Usage**:
```javascript
try {
  const devices = await this.pollDevices();
  console.log('Polled devices:', Object.keys(devices.hb));
} catch (error) {
  console.error('Poll failed:', error);
}
```

---

##### `refreshAccessoryState(accessory)`

On-demand refresh for a specific accessory.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory to refresh

**Returns**: `Promise<DeviceState>` - Current device state

**Description**: Prevents concurrent refreshes, returns cached data if refresh is in progress.

**Usage**:
```javascript
const state = await platform.refreshAccessoryState(accessory);
console.log('Current temp:', state.CurrentTemperature);
```

---

##### `updateStatus(accessory, device)`

Update accessory with new device data.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory to update
- `device` (DeviceState): New device state

**Returns**: `void`

**Description**: Updates all characteristics, stores persistent data, updates FakeGato history.

---

##### `scheduleVerificationPoll(delay)`

Schedule a verification poll after user changes.

**Parameters**:
- `delay` (number): Delay in milliseconds (default: 30000)

**Returns**: `void`

**Description**: Confirms changes were applied successfully, prevents multiple concurrent verification polls.

---

##### `normalizeCharacteristicValue(accessory, characteristic, rawValue)`

Normalize temperature value for display.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory context
- `characteristic` (Characteristic): HAP characteristic
- `rawValue` (number): Raw temperature value

**Returns**: `number` - Normalized value

**Description**: Handles Fahrenheit rounding, clamps to min/max, applies temperature step.

**Example**:
```javascript
const normalized = platform.normalizeCharacteristicValue(
  accessory,
  targetTempCharacteristic,
  21.5 // 21.5°C
);
// Returns: 21.5 (C) or 21.1 (converted from 70°F)
```

---

##### `getChangeThermostat(accessory)`

Get ChangeThermostat helper for an accessory.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory instance

**Returns**: `ChangeThermostat` - Change handler

**Description**: Returns existing handler or creates new one, rebinds if service changed.

---

## TCC API Client

### Tcc

TCC API client for communicating with Honeywell servers.

**Location**: `src/lib/tcc.js`

#### Constructor

```javascript
constructor(platform)
```

**Parameters**:
- `platform` (TccPlatform): Platform instance

---

#### Methods

##### `login()`

Authenticate with TCC API.

**Returns**: `Promise<string>` - Session ID

**Throws**: `Error` - If authentication fails

**Description**: Obtains session token for subsequent API calls.

---

##### `pollThermostat()`

Fetch all thermostats and locations.

**Returns**: `Promise<Object>` - Normalized device data

**Structure**:
```javascript
{
  LocationInfo: Array<Location>,
  hb: {
    [thermostatID]: DeviceState
  }
}
```

**Description**: Full data refresh, includes all locations and thermostats.

---

##### `getThermostatSnapshot(thermostatID)`

Fetch single thermostat data quickly.

**Parameters**:
- `thermostatID` (number): Thermostat ID

**Returns**: `Promise<DeviceState>` - Device state

**Description**: Fast refresh for individual thermostat, preserves LastPhysicalHeatMode.

---

##### `ChangeThermostat(desiredState)`

Send thermostat changes to TCC API.

**Parameters**:
- `desiredState` (Object): Desired thermostat state

```javascript
{
  ThermostatID: number,
  TargetTemperature?: number,
  TargetHeatingCooling?: 0|1|2|3,
  HeatingThresholdTemperature?: number,
  CoolingThresholdTemperature?: number,
  LastPhysicalHeatMode?: 0|1
}
```

**Returns**: `Promise<DeviceState>` - Updated device state

**Description**: Builds SOAP message, sends to API, polls for confirmation.

---

## Message Builder API

### tccMessage

SOAP message building and data transformation.

**Location**: `src/lib/tccMessage.js`

#### Functions

##### `AuthenticateUserLoginMessage(username, password)`

Build login SOAP message.

**Parameters**:
- `username` (string): TCC account email
- `password` (string): TCC account password

**Returns**: `Object` - SOAP message object

---

##### `GetLocationsMessage(sessionID)`

Build get locations SOAP message.

**Parameters**:
- `sessionID` (string): Session token

**Returns**: `Object` - SOAP message object

---

##### `ChangeThermostatMessage(sessionID, desiredState, thermostat, usePermanentHolds)`

Build change thermostat SOAP message.

**Parameters**:
- `sessionID` (string): Session token
- `desiredState` (Object): Desired state
- `thermostat` (DeviceState): Current thermostat state
- `usePermanentHolds` (boolean): Use permanent holds

**Returns**: `Object` - SOAP message object

**Description**: Calculates setpoints, preserves current values for unchanged fields.

---

##### `toHb(thermostat)`

Convert TCC thermostat data to HomeKit format.

**Parameters**:
- `thermostat` (Object): Raw TCC thermostat data

**Returns**: `DeviceState` - HomeKit-formatted state

**Description**: Converts units, calculates derived values, extracts relevant fields.

---

##### `toCelcius(value, thermostat)`

Convert temperature to Celsius.

**Parameters**:
- `value` (number): Temperature value
- `thermostat` (Object): Thermostat with DisplayedUnits

**Returns**: `number` - Temperature in Celsius

---

##### `toThermostat(value, thermostat)`

Convert HomeKit value to thermostat format.

**Parameters**:
- `value` (number): HomeKit value (Celsius)
- `thermostat` (DeviceState): Thermostat state

**Returns**: `number` - Value in thermostat's units

**Description**: Converts to Fahrenheit if needed, rounds appropriately.

---

##### `systemSwitch(desiredState, thermostat)`

Map HomeKit mode to TCC SystemSwitchPosition.

**Parameters**:
- `desiredState` (Object): Desired state
- `thermostat` (DeviceState): Current state

**Returns**: `number` - TCC SystemSwitchPosition (0-5)

**Mapping**:
| HomeKit | TCC |
|---------|-----|
| Off (0) | 2 |
| Heat (1) | 0 (emergency) or 1 (regular) |
| Cool (2) | 3 |
| Auto (3) | 4 or 5 |

---

##### `validateThermostatData(data, context)`

Validate thermostat data integrity.

**Parameters**:
- `data` (Object): Thermostat data
- `context` (string): Context for error messages

**Returns**: `boolean` - true if valid

**Throws**: `Error` - If validation fails

---

## Accessories API

### TccAccessory

Main thermostat accessory.

**Location**: `src/accessories/tccThermostatAccessory.js`

#### Constructor

```javascript
constructor(platform, device, sensors, Accessory, Service, Characteristic, UUIDGen, CustomCharacteristics, FakeGatoHistoryService)
```

**Parameters**:
- `platform` (TccPlatform): Platform instance
- `device` (DeviceState): Initial device state
- `sensors` (string): Sensor configuration
- `Accessory` (Class): Homebridge Accessory class
- `Service` (Object): HAP Service
- `Characteristic` (Object): HAP Characteristic
- `UUIDGen` (Object): UUID generator
- `CustomCharacteristics` (Object): Eve custom characteristics
- `FakeGatoHistoryService` (Class): FakeGato history service

**Returns**: `PlatformAccessory` - Configured accessory

---

### TccSensorsAccessory

Outside sensors accessory.

**Location**: `src/accessories/tccSensorsAccessory.js`

#### Constructor

Similar to TccAccessory but creates outside temperature/humidity sensors.

---

## Handlers API

### Characteristic Handlers

HomeKit characteristic get/set implementations.

**Location**: `src/handlers/characteristicHandlers.js`

All handlers are bound to accessory instances and use these properties:
- `this.platform` - Platform instance
- `this.context` - Persistent accessory data
- `this.getService()` - Get HAP service
- `this.logger` - Accessory logger

#### Getter Pattern

```javascript
function getSomething(callback) {
  this.platform.refreshAccessoryState(this)
    .then(device => callback(null, device.Something))
    .catch(error => handleRefreshError(callback, error));
}
```

#### Setter Pattern

```javascript
function setSomething(value, callback) {
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({ Something: value })
    .then(() => callback(null))
    .catch(error => callback(error));
}
```

#### Available Handlers

**Getters**:
- `getTargetTemperature(callback)`
- `getCurrentTemperature(callback)`
- `getCurrentRelativeHumidity(callback)`
- `getTargetHeatingCooling(callback)`
- `getCurrentHeatingCooling(callback)`
- `getHeatingThresholdTemperature(callback)`
- `getCoolingThresholdTemperature(callback)`
- `getSensorTemperature(property, callback)`
- `getSensorHumidity(property, callback)`

**Setters**:
- `setTargetTemperature(value, callback)`
- `setTargetHeatingCooling(value, callback)`
- `setHeatingThresholdTemperature(value, callback)`
- `setCoolingThresholdTemperature(value, callback)`

---

## Helpers API

### ChangeThermostat

Consolidates rapid changes into single API requests.

**Location**: `src/helpers/changeThermostat.js`

#### Constructor

```javascript
constructor(accessory, thermostatsInstance, platform)
```

#### Methods

##### `put(state)`

Queue a thermostat change.

**Parameters**:
- `state` (Object): Partial state update

```javascript
{
  TargetTemperature?: number,
  TargetHeatingCooling?: 0|1|2|3,
  HeatingThresholdTemperature?: number,
  CoolingThresholdTemperature?: number
}
```

**Returns**: `Promise<DeviceState>` - Updated state

**Description**: Debounces changes over 100ms window, merges multiple calls.

**Example**:
```javascript
const changeThermostat = platform.getChangeThermostat(accessory);

// These will be combined into one API call
await changeThermostat.put({ TargetHeatingCooling: 1 });
await changeThermostat.put({ TargetTemperature: 22 });
// After 100ms delay, single request is sent
```

---

### Service Manager

Manages HAP service lifecycle.

**Location**: `src/helpers/serviceManager.js`

#### Functions

##### `registerManagedService(accessory, service)`

Register a service for tracking.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory instance
- `service` (Service): HAP service to register

**Returns**: `void`

---

##### `unregisterManagedService(accessory, service)`

Unregister a service.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory instance
- `service` (Service): HAP service to unregister

**Returns**: `void`

---

##### `pruneUnsupportedServices(accessory, logger, Service)`

Remove orphaned services.

**Parameters**:
- `accessory` (PlatformAccessory): Accessory instance
- `logger` (Logger): Logger instance
- `Service` (Object): HAP Service class

**Returns**: `void`

**Description**: Removes services not in managed list or fallback list.

---

## Logger API

### createLogger

Create structured logger instance.

**Location**: `src/lib/logger.js`

#### Function

```javascript
createLogger(log, options)
```

**Parameters**:
- `log` (Function): Homebridge log function
- `options` (Object): Logger configuration

```javascript
{
  prefix: Array<string>,    // Hierarchical prefix
  debug: boolean,           // Enable debug logging
  namespace: string         // Debug namespace (e.g., 'tcc')
}
```

**Returns**: `Logger` - Logger instance

**Methods**:
- `info(message, ...args)` - Log info message
- `warn(message, ...args)` - Log warning
- `error(message, ...args)` - Log error
- `debug(message, ...args)` - Log debug (if enabled)
- `enableDebug()` - Enable debug logging
- `disableDebug()` - Disable debug logging
- `child(additionalPrefix)` - Create child logger

**Example**:
```javascript
const logger = createLogger(log, {
  prefix: ['Platform'],
  debug: true,
  namespace: 'tcc'
});

logger.info('Platform initialized');
logger.debug('Configuration:', config);

const accessoryLogger = logger.child(['Accessory', 'Living Room']);
accessoryLogger.info('Temperature changed');
// Output: [Platform] [Accessory] [Living Room] Temperature changed
```

---

## Type Definitions

### DeviceState

HomeKit-formatted thermostat state.

```typescript
interface DeviceState {
  ThermostatID: number;
  Name: string;
  Model: string;
  CurrentTemperature: number;           // Celsius
  TargetTemperature: number;            // Celsius
  CurrentHeatingCoolingState: 0 | 1 | 2;  // Off | Heating | Cooling
  TargetHeatingCoolingState: 0 | 1 | 2 | 3; // Off | Heat | Cool | Auto
  HeatingThresholdTemperature: number;  // Celsius
  CoolingThresholdTemperature: number;  // Celsius
  TargetTemperatureHeatMinValue: number;
  TargetTemperatureHeatMaxValue: number;
  TargetTemperatureCoolMinValue: number;
  TargetTemperatureCoolMaxValue: number;
  TargetHeatingCoolingStateValidValues: Array<0|1|2|3>;
  OutsideTemperature: number | null;    // Celsius
  OutsideHumidity: number | null;       // 0-100 or 128 (invalid)
  InsideHumidity: number | null;        // 0-100 or 128 (invalid)
  LastPhysicalHeatMode?: 0 | 1;         // Emergency | Regular
  device: Object;                       // Raw TCC data
}
```

### TCC Raw Thermostat

Raw thermostat data from TCC API.

```typescript
interface TccThermostat {
  ThermostatID: number;
  UserDefinedDeviceName: string;
  ModelTypeName: string;
  EquipmentStatus: 'Off' | 'Heating' | 'Cooling';
  UI: {
    DisplayedUnits: 'C' | 'F';
    DispTemperature: number;
    HeatSetpoint: number;
    CoolSetpoint: number;
    SystemSwitchPosition: 0 | 1 | 2 | 3 | 4 | 5;
    HeatNextPeriod: number;
    CoolNextPeriod: number;
    OutdoorTemp: number;
    OutdoorHumidity: number;
    IndoorHumidity: number;
    HeatLowerSetptLimit: number;
    HeatUpperSetptLimit: number;
    CoolLowerSetptLimit: number;
    CoolUpperSetptLimit: number;
    CanSetSwitchOff: boolean;
    CanSetSwitchHeat: boolean;
    CanSetSwitchCool: boolean;
    CanSetSwitchAuto: boolean;
  };
}
```

### SystemSwitchPosition

TCC system mode values.

```typescript
enum SystemSwitchPosition {
  EmergencyHeat = 0,
  Heat = 1,
  Off = 2,
  Cool = 3,
  AutoHeat = 4,
  AutoCool = 5
}
```

### HomeKit States

```typescript
enum CurrentHeatingCoolingState {
  Off = 0,
  Heat = 1,
  Cool = 2
}

enum TargetHeatingCoolingState {
  Off = 0,
  Heat = 1,
  Cool = 2,
  Auto = 3
}
```

---

## Error Codes

### TCC API Errors

| Code | Message | Meaning |
|------|---------|---------|
| `InvalidSessionID` | Session expired | Need to re-login |
| `InvalidCredentials` | Bad username/password | Check credentials |
| `RateLimitExceeded` | Too many requests | Back off and retry |
| `ThermostatNotFound` | Invalid thermostat ID | Check device list |
| `NetworkError` | Connection failed | Check internet |

### Plugin Errors

| Error | Meaning | Resolution |
|-------|---------|------------|
| `No state available` | Refresh failed | Wait for next poll |
| `Thermostat service not initialized` | Platform not ready | Wait a moment and retry |
| `Invalid thermostat data` | Data validation failed | Check TCC API response |

---

## Events

### Platform Lifecycle

1. `constructor()` - Platform created
2. `configureAccessory()` - Cached accessories restored (if any)
3. `didFinishLaunching()` - Homebridge ready
4. `shutdown()` - Platform shutting down

### Accessory Lifecycle

1. `constructor()` - Accessory created
2. Services added
3. Characteristics configured
4. Registered with Homebridge
5. `updateStatus()` - Initial state set

---

## Best Practices

### For Plugin Developers

1. **Use Existing Patterns**: Follow established patterns in the codebase
2. **Error Handling**: Always catch and handle errors gracefully
3. **Logging**: Use structured logging with appropriate levels
4. **Testing**: Write tests for new functionality
5. **Documentation**: Update JSDoc comments and documentation files

### For Integrators

1. **Don't Poll Excessively**: Respect rate limits (min 600s refresh)
2. **Handle "No Response"**: Implement graceful degradation
3. **Cache Data**: Use cached data when API is unavailable
4. **Validate Input**: Always validate user input
5. **Log Errors**: Log errors with context for debugging

---

## Examples

### Adding a New Characteristic

```javascript
// 1. Add to accessories/tccThermostatAccessory.js
thermostatService
  .getCharacteristic(Characteristic.MyNewCharacteristic)
  .on('get', getMyNewCharacteristic.bind(this.accessory))
  .on('set', setMyNewCharacteristic.bind(this.accessory));

// 2. Add handlers to handlers/characteristicHandlers.js
function getMyNewCharacteristic(callback) {
  this.platform.refreshAccessoryState(this)
    .then(device => callback(null, device.MyValue))
    .catch(error => handleRefreshError(callback, error));
}

function setMyNewCharacteristic(value, callback) {
  const changeThermostat = this.platform.getChangeThermostat(this);
  changeThermostat.put({ MyValue: value })
    .then(() => callback(null))
    .catch(error => callback(error));
}

// 3. Export the handlers
module.exports = {
  // ... existing handlers
  getMyNewCharacteristic,
  setMyNewCharacteristic
};

// 4. Add mapping in lib/tccMessage.js
function toHb(thermostat) {
  const response = {};
  // ... existing mappings
  response.MyValue = thermostat.UI.SomeField;
  return response;
}
```

---

## Reference Links

- [Homebridge Plugin Development](https://developers.homebridge.io/)
- [HAP-NodeJS Documentation](https://github.com/homebridge/HAP-NodeJS)
- [HomeKit Accessory Protocol Specification](https://developer.apple.com/homekit/)

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-24
**Maintainer**: @thindiyeh
