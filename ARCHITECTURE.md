# Architecture Documentation

> **homebridge-tcc** - Modular Plugin Architecture
> Version: 1.0.0-beta.0

## Table of Contents

- [Overview](#overview)
- [Architecture Principles](#architecture-principles)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Request Processing](#request-processing)
- [State Management](#state-management)
- [Error Handling](#error-handling)
- [Testing Strategy](#testing-strategy)

---

## Overview

The homebridge-tcc plugin follows a **modular, layered architecture** that separates concerns and promotes maintainability, testability, and extensibility.

### Key Design Goals

1. **Separation of Concerns** - Each module has a single, well-defined responsibility
2. **Maintainability** - Easy to understand, modify, and extend
3. **Testability** - Components can be tested in isolation
4. **Homebridge Compliance** - Follows official Homebridge plugin best practices
5. **Performance** - Efficient polling and caching strategies
6. **Reliability** - Robust error handling and recovery

---

## Architecture Principles

### 1. Layered Architecture

```
┌─────────────────────────────────────────────────┐
│              HomeKit / Home App                  │
└─────────────────────────────────────────────────┘
                      ↕ HAP Protocol
┌─────────────────────────────────────────────────┐
│             Homebridge Platform                  │
│  ┌───────────────────────────────────────────┐  │
│  │        TCC Platform (Coordinator)         │  │
│  └───────────────────────────────────────────┘  │
│           ↕                    ↕                 │
│  ┌──────────────┐      ┌──────────────────┐     │
│  │  Accessories  │      │    Handlers      │     │
│  │   (HAP)      │←────→│ (Characteristics)│     │
│  └──────────────┘      └──────────────────┘     │
│           ↕                    ↕                 │
│  ┌──────────────┐      ┌──────────────────┐     │
│  │   Helpers    │      │   TCC Service    │     │
│  │  (Utilities) │      │   (API Client)   │     │
│  └──────────────┘      └──────────────────┘     │
└─────────────────────────────────────────────────┘
                      ↕ SOAP/HTTPS
┌─────────────────────────────────────────────────┐
│         Honeywell TCC Cloud API                  │
└─────────────────────────────────────────────────┘
```

### 2. Module Responsibilities

| Layer | Modules | Responsibility |
|-------|---------|----------------|
| **Entry Point** | `index.js` | Plugin registration |
| **Coordination** | `platform.js` | Lifecycle management, accessory coordination |
| **Accessories** | `accessories/` | HAP service and characteristic management |
| **Handlers** | `handlers/` | Characteristic get/set implementations |
| **Helpers** | `helpers/` | Reusable utility classes |
| **API Client** | `lib/tcc.js` | Honeywell TCC API communication |
| **Messaging** | `lib/tccMessage.js` | SOAP message building and parsing |
| **Logging** | `lib/logger.js` | Structured logging |

---

## Directory Structure

```
homebridge-tcc/
├── src/
│   ├── index.js                    # Plugin entry point (18 lines)
│   ├── platform.js                 # Platform coordinator (626 lines)
│   ├── accessories/
│   │   ├── tccThermostatAccessory.js   # Main thermostat (273 lines)
│   │   └── tccSensorsAccessory.js      # Outside sensors (126 lines)
│   ├── handlers/
│   │   ├── characteristicHandlers.js   # Get/set handlers (229 lines)
│   │   └── errorHandler.js             # Error utilities (22 lines)
│   ├── helpers/
│   │   ├── changeThermostat.js         # Request consolidation (97 lines)
│   │   └── serviceManager.js           # Service utilities (83 lines)
│   └── lib/
│       ├── tcc.js                      # API client (417 lines)
│       ├── tccMessage.js               # SOAP messaging (470 lines)
│       └── logger.js                   # Logging framework (136 lines)
├── __tests__/                      # Test suites (70 tests)
├── config.schema.json              # Homebridge UI configuration
├── package.json                    # Dependencies and metadata
├── README.md                       # User documentation
├── ARCHITECTURE.md                 # This file
├── CONTRIBUTING.md                 # Contribution guidelines
├── API.md                          # Developer API reference
└── TESTING.md                      # Test documentation
```

### Code Metrics

- **Total Lines**: ~2,497
- **Average File Size**: ~227 lines
- **Test Coverage**: 100% (tccMessage.js)
- **Test Pass Rate**: 100% (70/70 tests)
- **Linting**: 0 warnings

---

## Core Components

### 1. Entry Point (`index.js`)

**Purpose**: Minimal plugin registration

```javascript
// Registers the TccPlatform with Homebridge
module.exports = function (homebridge) {
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TccPlatform);
};
```

**Responsibilities**:
- Export platform registration function
- No business logic (keeps entry point clean)

---

### 2. Platform (`platform.js`)

**Purpose**: Orchestrates the entire plugin lifecycle

**Key Responsibilities**:
- Initialize TCC API client
- Manage accessory lifecycle (create, configure, update)
- Coordinate polling strategies (main poll, background refresh, verification poll)
- Handle platform-level state and caching
- Provide utility methods for temperature normalization

**Key Methods**:

| Method | Purpose |
|--------|---------|
| `constructor()` | Initialize configuration and dependencies |
| `didFinishLaunching()` | Start polling and create accessories |
| `configureAccessory()` | Restore cached accessories on restart |
| `pollDevices()` | Main polling cycle for all thermostats |
| `refreshAccessoryState()` | On-demand refresh for characteristic reads |
| `updateStatus()` | Update accessory with new data from API |
| `scheduleVerificationPoll()` | Smart polling after user changes |
| `startBackgroundRefresh()` | Fast polling for individual thermostats |

**State Management**:
```javascript
{
  thermostats: TccApiClient,        // API client instance
  myAccessories: Array<Accessory>,  // All registered accessories
  changeThermostatMap: WeakMap,     // Per-accessory change handlers
  pollInterval: Timer,              // Main polling timer
  backgroundRefreshTimer: Timer,    // Background polling timer
  verificationPollTimeout: Timer,   // Smart verification timer
  refreshInFlight: Promise          // Prevents concurrent refreshes
}
```

---

### 3. Accessories

#### TccThermostatAccessory (`accessories/tccThermostatAccessory.js`)

**Purpose**: Manages the main thermostat accessory and its services

**Services Created**:
- `Service.Thermostat` - Main thermostat control
- `Service.TemperatureSensor` - Optional inside temperature
- `Service.HumiditySensor` - Optional inside humidity

**Characteristics**:
- Current/Target Temperature
- Current/Target Heating Cooling State
- Heating/Cooling Threshold Temperature
- Current Relative Humidity
- Custom: ValvePosition (Eve app)

**Configuration**:
```javascript
{
  name: "Living Room",
  ThermostatID: 123456,
  sensors: "all" | "inside" | "insideHumidity" | "none",
  usePermanentHolds: true | false
}
```

#### TccSensorsAccessory (`accessories/tccSensorsAccessory.js`)

**Purpose**: Provides outside temperature and humidity sensors

**Services Created**:
- `Service.TemperatureSensor` - Outside temperature
- `Service.HumiditySensor` - Outside humidity

**Use Case**: Enables HomeKit automations based on outdoor conditions

---

### 4. Handlers (`handlers/`)

#### characteristicHandlers.js

**Purpose**: Implements HomeKit characteristic get/set callbacks

**Pattern**: All handlers are bound to accessory instances:
```javascript
thermostatService
  .getCharacteristic(Characteristic.TargetTemperature)
  .on('get', getTargetTemperature.bind(accessory))
  .on('set', setTargetTemperature.bind(accessory));
```

**Handler Types**:

1. **Getters** (callback pattern):
   ```javascript
   function getTargetTemperature(callback) {
     this.platform.refreshAccessoryState(this)
       .then(device => callback(null, device.TargetTemperature))
       .catch(error => handleRefreshError(callback, error));
   }
   ```

2. **Setters** (value, callback pattern):
   ```javascript
   function setTargetTemperature(value, callback) {
     const changeThermostat = this.platform.getChangeThermostat(this);
     changeThermostat.put({ TargetTemperature: value })
       .then(() => callback(null))
       .catch(error => callback(error));
   }
   ```

**Context Access**:
- `this.platform` - Access to platform instance
- `this.context` - Accessory-specific persistent data
- `this.getService()` - Access to HAP services
- `this.logger` - Accessory-specific logger

---

### 5. Helpers

#### changeThermostat.js

**Purpose**: Consolidates rapid changes into single API requests

**Problem Solved**: HomeKit may send multiple characteristic changes in quick succession (e.g., mode + temperature). Sending each as a separate API call is inefficient and may trigger rate limiting.

**Solution**: 100ms debounce window collects all changes before sending:

```javascript
// Multiple rapid changes:
changeThermostat.put({ TargetHeatingCooling: 1 });  // Heat mode
changeThermostat.put({ TargetTemperature: 22 });    // 22°C

// Result: Single API call with both changes after 100ms
```

**Key Features**:
- Promise-based API for easy async/await usage
- Automatic retry logic
- Optimistic updates (immediate feedback)
- Verification polling (confirms changes worked)

#### serviceManager.js

**Purpose**: Manages HomeKit service lifecycle

**Functions**:

1. **registerManagedService()** - Tracks services for this accessory
2. **unregisterManagedService()** - Removes service from tracking
3. **pruneUnsupportedServices()** - Removes orphaned services from cache

**Use Case**: When plugin updates or config changes, old services may exist in cache. Service manager ensures clean transitions.

---

### 6. API Client (`lib/tcc.js`)

**Purpose**: Communication with Honeywell TCC API

**Key Features**:
- SOAP over HTTPS protocol
- Automatic session management (login/re-login)
- Sequential request queue (prevents race conditions)
- Exponential backoff retry logic
- Request/response logging

**Key Methods**:

| Method | Purpose |
|--------|---------|
| `login()` | Authenticate and get session ID |
| `pollThermostat()` | Get all thermostats (full refresh) |
| `getThermostatSnapshot()` | Get single thermostat (fast refresh) |
| `ChangeThermostat()` | Send thermostat changes |

**Queue Management**:
```javascript
// All requests go through p-queue
this.queue = new PQueue({
  concurrency: 1,  // Sequential processing
  timeout: 30000   // 30-second timeout
});
```

---

### 7. Message Builder (`lib/tccMessage.js`)

**Purpose**: Build SOAP XML messages and parse responses

**Key Functions**:

| Function | Purpose |
|----------|---------|
| `AuthenticateUserLoginMessage()` | Login SOAP message |
| `GetLocationsMessage()` | Fetch all locations/thermostats |
| `ChangeThermostatMessage()` | Update thermostat settings |
| `GetThermostatMessage()` | Fetch single thermostat |
| `toHb()` | Convert TCC data → HomeKit format |
| `toThermostat()` | Convert HomeKit value → TCC format |
| `systemSwitch()` | Map HomeKit mode → TCC SystemSwitchPosition |
| `heatSetpoint()` / `coolSetpoint()` | Calculate setpoints |
| `validateThermostatData()` | Data integrity checks |

**State Mapping**:

| HomeKit State | TCC SystemSwitchPosition |
|---------------|-------------------------|
| Off (0) | 2 |
| Heat (1) | 0 (emergency) or 1 (regular) |
| Cool (2) | 3 |
| Auto (3) | 4 (auto heat) or 5 (auto cool) |

---

### 8. Logger (`lib/logger.js`)

**Purpose**: Structured, hierarchical logging

**Features**:
- Namespace-based filtering (`DEBUG=tcc:*`)
- Hierarchical prefixes (`Platform`, `Accessory`, `ChangeThermostat`)
- Dynamic enable/disable
- Fallback to console if debug unavailable

**Usage**:
```javascript
const logger = createLogger(log, {
  prefix: ['Platform'],
  debug: true,
  namespace: 'tcc'
});

logger.info('Platform initialized');
logger.debug('Detailed debug info', { data });
```

---

## Data Flow

### 1. Initialization Flow

```
Homebridge Startup
    ↓
index.js: registerPlatform()
    ↓
platform.js: constructor()
    ├─ Initialize logger
    ├─ Parse configuration
    └─ Register lifecycle hooks
    ↓
platform.js: didFinishLaunching()
    ├─ Create TCC API client
    ├─ Initial poll: pollThermostat()
    │    └─ tcc.js: GetLocations SOAP call
    ├─ Create accessories for each thermostat
    │    ├─ TccThermostatAccessory.constructor()
    │    └─ TccSensorsAccessory.constructor() (optional)
    ├─ Register with Homebridge API
    └─ Start polling intervals
         ├─ Main poll (600s)
         └─ Background refresh (180s)
```

### 2. User Change Flow (Home App → Thermostat)

```
User sets temperature in Home app
    ↓
characteristicHandlers.js: setTargetTemperature()
    ├─ Normalize value for device units (F/C)
    ├─ Update characteristic immediately (optimistic)
    └─ Call ChangeThermostat
    ↓
changeThermostat.js: put({ TargetTemperature })
    ├─ Queue change (100ms debounce window)
    ├─ Inject persisted LastPhysicalHeatMode
    └─ After 100ms, execute batch
    ↓
tcc.js: ChangeThermostat()
    ├─ Build SOAP message
    ├─ Add to request queue
    └─ Send to TCC API
    ↓
tccMessage.js: ChangeThermostatMessage()
    ├─ Calculate setpoints based on mode
    ├─ Build complete XML payload
    └─ Return SOAP message
    ↓
TCC API applies changes
    ↓
platform.js: scheduleVerificationPoll(30s)
    └─ Confirms change was applied successfully
```

### 3. Polling Flow (Thermostat → Home App)

```
Timer fires (600s or 180s)
    ↓
platform.js: pollDevices()
or
platform.js: runBackgroundRefresh()
    ↓
tcc.js: pollThermostat() or getThermostatSnapshot()
    ├─ Queue request
    ├─ Check session validity
    ├─ Send SOAP request
    └─ Parse XML response
    ↓
tccMessage.js: normalizeToHb() / toHb()
    ├─ Extract thermostat data
    ├─ Convert units (F→C if needed)
    ├─ Calculate derived values
    └─ Validate data integrity
    ↓
platform.js: updateStatus(accessory, device)
    ├─ Update all characteristics
    ├─ Store LastPhysicalHeatMode if present
    ├─ Update FakeGato history
    └─ Normalize temperatures for display
```

### 4. Characteristic Read Flow (Home App refresh)

```
Home app requests current temperature
    ↓
characteristicHandlers.js: getCurrentTemperature()
    ↓
platform.js: refreshAccessoryState(accessory)
    ├─ Check if refresh in flight
    ├─ If yes, wait for existing refresh
    └─ If no, start new pollDevices()
    ↓
Returns cached device data
    ↓
Characteristic callback(null, value)
```

---

## Request Processing

### API Request Queue

All TCC API requests go through a sequential queue to prevent:
- Race conditions
- Request stampedes
- Session conflicts
- Rate limiting

```javascript
// In tcc.js
this.queue.add(() => {
  return this._makeRequest(soapMessage);
});
```

**Queue Properties**:
- **Concurrency**: 1 (one request at a time)
- **Timeout**: 30 seconds per request
- **Retry**: Automatic with exponential backoff

### Session Management

**States**:
1. **No Session** → Trigger login()
2. **Valid Session** → Use existing sessionID
3. **Expired Session** → Detect InvalidSessionID error, re-login
4. **Rate Limited** → Back off, retry later

**Session Lifecycle**:
```javascript
if (!this.sessionID) {
  await this.login();
}

try {
  await this.makeRequest();
} catch (error) {
  if (error.message.includes('InvalidSessionID')) {
    this.sessionID = null;
    // Next request will trigger re-login
  }
  throw error;
}
```

---

## State Management

### Platform State

```javascript
{
  thermostats: TccApiClient,              // API client
  myAccessories: Array<Accessory>,        // All accessories
  changeThermostatMap: WeakMap,           // Change handlers per accessory
  pollInterval: NodeJS.Timer,             // Main poll timer
  backgroundRefreshTimer: NodeJS.Timer,   // Fast poll timer
  verificationPollTimeout: NodeJS.Timer,  // Verification timer
  refreshInFlight: Promise<void>          // Current refresh promise
}
```

### Accessory Context (Persisted)

```javascript
accessory.context = {
  ThermostatID: Number,                 // TCC thermostat ID
  name: String,                         // Display name
  logEventCounter: Number,              // FakeGato counter
  temperatureStep: Number,              // 0.5 (C) or 0.1 (F)
  displayedUnits: String,               // "C" or "F"
  lastPhysicalHeatMode: Number,         // 0 or 1 (emergency heat preference)
  managedServiceUUIDs: Array<String>    // Service tracking
};
```

**Persistence**: Homebridge automatically saves `accessory.context` to `~/.homebridge/accessories/cachedAccessories`.

### Device State (In Memory)

```javascript
{
  ThermostatID: Number,
  Name: String,
  Model: String,
  CurrentTemperature: Number,
  TargetTemperature: Number,
  CurrentHeatingCoolingState: 0|1|2,
  TargetHeatingCoolingState: 0|1|2|3,
  HeatingThresholdTemperature: Number,
  CoolingThresholdTemperature: Number,
  InsideHumidity: Number,
  OutsideHumidity: Number,
  OutsideTemperature: Number,
  LastPhysicalHeatMode: 0|1|undefined,
  device: Object  // Raw TCC data
}
```

---

## Error Handling

### Error Types

1. **Network Errors** - Connection lost, timeout
2. **API Errors** - Invalid credentials, rate limiting, server errors
3. **Session Errors** - InvalidSessionID, expired session
4. **Data Errors** - Invalid thermostat data, validation failures
5. **Configuration Errors** - Missing credentials, invalid settings

### Error Strategies

| Error Type | Strategy |
|------------|----------|
| Network | Retry with exponential backoff |
| Invalid Session | Clear session, re-login on next request |
| Rate Limit | Log warning, continue with existing data |
| Data Validation | Log warning, return cached data |
| Configuration | Log error, disable feature |

### Error Propagation

```
Handler Error
    ↓
errorHandler.js: handleRefreshError()
    ↓
Convert to Error object
    ↓
Return to HomeKit
    ↓
Home app shows "No Response"
```

### Graceful Degradation

- **API Down** → Use last known state, show warnings
- **Single Thermostat Error** → Continue with other thermostats
- **Validation Failure** → Use previous valid data

---

## Testing Strategy

### Test Coverage

- **Unit Tests**: Individual functions (tccMessage.js at 100%)
- **Integration Tests**: End-to-end workflows (emergency heat, polling)
- **Regression Tests**: Bug fixes remain fixed (cache preservation)

### Test Files

| File | Purpose | Tests |
|------|---------|-------|
| `emergencyHeat.test.js` | Emergency heat tracking and persistence | 33 |
| `cachePreservation.test.js` | Cache preservation across polls | 15 |
| `humidityMapping.test.js` | Humidity data flow | 6 |
| `tccMessage.test.js` | SOAP message building | 10 |
| `logger.test.js` | Logging functionality | 6 |

### Running Tests

```bash
npm test              # Run all tests
npm run test-coverage # With coverage report
npx jest --watch      # Watch mode
```

---

## Performance Characteristics

### Memory Usage

- **Platform**: ~2MB baseline
- **Per Accessory**: ~100KB
- **API Client**: ~500KB (includes queue, cache)
- **Total (typical 2 thermostats)**: ~3-4MB

### CPU Usage

- **Idle**: <0.1%
- **Polling**: 0.5-1% for ~1 second
- **User Change**: 0.2-0.5% for ~500ms

### Network Traffic

- **Main Poll (10 min)**: ~5KB request, ~10KB response
- **Background Refresh (3 min)**: ~3KB request, ~5KB response
- **User Change**: ~4KB request, ~2KB response
- **Daily Total**: ~50-100KB

### API Requests

- **Main Poll**: 6 requests/hour (600s interval)
- **Background Refresh**: 20 requests/hour (180s interval, per thermostat)
- **User Changes**: Variable, immediate
- **Verification Polls**: 1 per user change (30s delay)

---

## Extension Points

### Adding New Features

1. **New Characteristic**:
   - Add handler in `characteristicHandlers.js`
   - Bind in accessory constructors
   - Map data in `tccMessage.js:toHb()`

2. **New Accessory Type**:
   - Create in `accessories/`
   - Instantiate in `platform.js:didFinishLaunching()`
   - Register services and characteristics

3. **New API Endpoint**:
   - Add method to `tcc.js`
   - Add message builder to `tccMessage.js`
   - Queue through `this.queue.add()`

4. **New Configuration Option**:
   - Add to `config.schema.json` (for UI)
   - Parse in `platform.js:constructor()`
   - Document in README

---

## Security Considerations

### Credentials

- Stored in Homebridge config file (plain text)
- Transmitted over HTTPS to TCC API
- Session tokens cached in memory only
- **Recommendation**: Secure Homebridge server appropriately

### API Communication

- HTTPS only (TLS 1.2+)
- No certificate pinning (relies on system trust store)
- SOAP XML with proper escaping

### Data Validation

- All thermostat data validated before use
- Temperature ranges checked
- State values validated
- Missing fields handled gracefully

---

## Future Improvements

### Potential Enhancements

1. **Push Notifications** - Requires reverse engineering TCC mobile app
2. **Direct WiFi** - Local communication bypassing cloud
3. **Geofencing** - Home/away integration
4. **Advanced Scheduling** - HomeKit schedule sync with TCC
5. **Multi-Zone** - Zone controller support
6. **International Support** - EU/Asia TCC API

### Known Limitations

1. **Cloud Dependency** - Requires internet and TCC servers
2. **Polling Delay** - 3-10 minute latency for physical changes
3. **Rate Limiting** - 10-minute minimum main poll interval
4. **No Local Control** - Cannot operate if cloud is down

---

## Appendix

### Useful Commands

```bash
# Development
npm run watch           # Auto-reload on changes
npm run lint            # Check code quality
npm run lint:fix        # Auto-fix linting issues

# Testing
npm test                # Run all tests
npm run test-coverage   # Coverage report
npx jest --watch        # Watch mode

# Debugging
DEBUG=tcc* homebridge   # Enable debug logging
```

### Key Files to Review

- `src/platform.js` - Start here for understanding flow
- `src/lib/tcc.js` - API client implementation
- `src/lib/tccMessage.js` - Data transformation logic
- `__tests__/emergencyHeat.test.js` - Example test patterns

### References

- [Homebridge Plugin Development](https://developers.homebridge.io/)
- [HAP Specification](https://github.com/homebridge/HAP-NodeJS)
- [TCC API Documentation](https://www.mytotalconnectcomfort.com/portal)

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-24
**Maintainer**: @thindiyeh
