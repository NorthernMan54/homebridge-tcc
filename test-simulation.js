#!/usr/bin/env node

/**
 * Comprehensive test simulation for homebridge-tcc
 * Simulates API calls and responses to test all functionality
 */

const { XMLBuilder, XMLParser } = require('fast-xml-parser');
const tccMessage = require('./src/lib/tccMessage.js');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '$t',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '$t',
  format: false,
  suppressEmptyNode: true
});

// Test counters
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`✗ ${testName}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    console.log(`✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`✗ ${testName}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    testsFailed++;
  }
}

function assertDeepEqual(actual, expected, testName) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`✗ ${testName}`);
    console.error(`  Expected: ${expectedStr}`);
    console.error(`  Actual: ${actualStr}`);
    testsFailed++;
  }
}

console.log('\n========================================');
console.log('HOMEBRIDGE-TCC TEST SIMULATION');
console.log('========================================\n');

// ============================================
// TEST 1: XML Builder with Text Nodes
// ============================================
console.log('TEST 1: XML Builder Configuration');
const testMessage = {
  AuthenticateUserLogin: {
    username: { $t: 'test@example.com' },
    password: { $t: 'password123' },
    applicationID: { $t: '357568d9-38ff-4fda-bfe2-46b0fa1dd864' }
  }
};

const builtXml = xmlBuilder.build(testMessage);
assert(builtXml.includes('<username>test@example.com</username>'), 'XML text nodes render correctly (not as $t attributes)');
assert(!builtXml.includes('$t='), 'XML does not contain $t attributes');

// ============================================
// TEST 2: Authentication Message Generation
// ============================================
console.log('\nTEST 2: Authentication Message');
const authMsg = tccMessage.AuthenticateUserLoginMessage('user@test.com', 'pass123');
assert(authMsg.AuthenticateUserLogin.username.$t === 'user@test.com', 'Username set correctly');
assert(authMsg.AuthenticateUserLogin.password.$t === 'pass123', 'Password set correctly');
assert(authMsg.AuthenticateUserLogin.applicationID.$t === '357568d9-38ff-4fda-bfe2-46b0fa1dd864', 'Application ID is correct');

const authXml = xmlBuilder.build(tccMessage.soapMessage(authMsg));
assert(authXml.includes('soap:Envelope'), 'SOAP envelope present');
assert(authXml.includes('soap:Body'), 'SOAP body present');
assert(authXml.includes('AuthenticateUserLogin'), 'Auth method present');

// ============================================
// TEST 3: Simulated Login Success Response
// ============================================
console.log('\nTEST 3: Login Response Parsing');
const loginSuccessResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <AuthenticateUserLoginResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <AuthenticateUserLoginResult>
        <Result>Success</Result>
        <SessionID>test-session-123456</SessionID>
      </AuthenticateUserLoginResult>
    </AuthenticateUserLoginResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedLogin = xmlParser.parse(loginSuccessResponse);
const loginResult = parsedLogin["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse.AuthenticateUserLoginResult;
assertEqual(loginResult.Result, "Success", 'Login result is Success');
assertEqual(loginResult.SessionID, "test-session-123456", 'Session ID extracted correctly');

// ============================================
// TEST 4: Simulated GetLocations Response (Single Thermostat)
// ============================================
console.log('\nTEST 4: GetLocations Response (Single Thermostat)');
const getLocationsResponseSingle = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLocationsResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <GetLocationsResult>
        <Result>Success</Result>
        <Locations>
          <LocationInfo>
            <Thermostats>
              <ThermostatInfo>
                <ThermostatID>12345</ThermostatID>
                <UserDefinedDeviceName>Living Room</UserDefinedDeviceName>
                <ModelTypeName>T6 Pro Z-Wave</ModelTypeName>
                <UI>
                  <DisplayedUnits>F</DisplayedUnits>
                  <DispTemperature>72</DispTemperature>
                  <HeatSetpoint>70</HeatSetpoint>
                  <CoolSetpoint>75</CoolSetpoint>
                  <SystemSwitchPosition>1</SystemSwitchPosition>
                  <EquipmentOutputStatus>0</EquipmentOutputStatus>
                  <OutdoorTemp>65</OutdoorTemp>
                  <OutdoorHumidity>45</OutdoorHumidity>
                  <IndoorHumidity>40</IndoorHumidity>
                  <HeatLowerSetptLimit>40</HeatLowerSetptLimit>
                  <HeatUpperSetptLimit>90</HeatUpperSetptLimit>
                  <CoolLowerSetptLimit>50</CoolLowerSetptLimit>
                  <CoolUpperSetptLimit>99</CoolUpperSetptLimit>
                  <CanSetSwitchOff>1</CanSetSwitchOff>
                  <CanSetSwitchHeat>1</CanSetSwitchHeat>
                  <CanSetSwitchCool>1</CanSetSwitchCool>
                  <CanSetSwitchAuto>1</CanSetSwitchAuto>
                  <HeatNextPeriod>68</HeatNextPeriod>
                  <CoolNextPeriod>78</CoolNextPeriod>
                </UI>
                <EquipmentStatus>Off</EquipmentStatus>
              </ThermostatInfo>
            </Thermostats>
          </LocationInfo>
        </Locations>
      </GetLocationsResult>
    </GetLocationsResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedLocations = xmlParser.parse(getLocationsResponseSingle);
const locationsResult = parsedLocations["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;
assertEqual(locationsResult.Result, "Success", 'GetLocations result is Success');
assert(locationsResult.Locations !== undefined, 'Locations object exists');
assert(locationsResult.Locations.LocationInfo !== undefined, 'LocationInfo exists');

const normalized = tccMessage.normalizeToHb(locationsResult.Locations);
assert(normalized.hb !== undefined, 'Normalized data has hb property');
assert(typeof normalized.hb === 'object' && !Array.isArray(normalized.hb), 'hb is an object, not an array');
assert(normalized.hb['12345'] !== undefined, 'Thermostat 12345 exists in hb');

const thermostat = normalized.hb['12345'];
assertEqual(thermostat.ThermostatID, 12345, 'Thermostat ID is correct');
assertEqual(thermostat.Name, 'Living Room', 'Thermostat name is correct');
assertEqual(thermostat.Model, 'T6 Pro Z-Wave', 'Thermostat model is correct');

// Test temperature conversion (F to C)
const expectedTemp = parseFloat(((72 - 32) * 5 / 9).toFixed(1));
assertEqual(thermostat.CurrentTemperature, expectedTemp, 'Temperature converted F to C correctly');

// Test heating threshold
const expectedHeatThreshold = parseFloat(((70 - 32) * 5 / 9).toFixed(1));
assertEqual(thermostat.HeatingThresholdTemperature, expectedHeatThreshold, 'Heating threshold converted correctly');

// Test target state (SystemSwitchPosition 1 = Heat = HomeKit state 1)
assertEqual(thermostat.TargetHeatingCoolingState, 1, 'Target state is Heat (1)');

// Test current state (EquipmentStatus "Off" = HomeKit state 0)
assertEqual(thermostat.CurrentHeatingCoolingState, 0, 'Current state is Off (0)');

// Test valid values
assertDeepEqual(thermostat.TargetHeatingCoolingStateValidValues, [0, 1, 2, 3], 'Valid heating/cooling states include all modes');

// ============================================
// TEST 5: GetLocations Response (Multiple Thermostats)
// ============================================
console.log('\nTEST 5: GetLocations Response (Multiple Thermostats)');
const getLocationsResponseMultiple = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLocationsResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <GetLocationsResult>
        <Result>Success</Result>
        <Locations>
          <LocationInfo>
            <Thermostats>
              <ThermostatInfo>
                <ThermostatID>11111</ThermostatID>
                <UserDefinedDeviceName>Upstairs</UserDefinedDeviceName>
                <ModelTypeName>T6 Pro</ModelTypeName>
                <UI>
                  <DisplayedUnits>C</DisplayedUnits>
                  <DispTemperature>22.5</DispTemperature>
                  <HeatSetpoint>21</HeatSetpoint>
                  <CoolSetpoint>24</CoolSetpoint>
                  <SystemSwitchPosition>3</SystemSwitchPosition>
                  <OutdoorTemp>18</OutdoorTemp>
                  <OutdoorHumidity>55</OutdoorHumidity>
                  <IndoorHumidity>45</IndoorHumidity>
                  <HeatLowerSetptLimit>10</HeatLowerSetptLimit>
                  <HeatUpperSetptLimit>30</HeatUpperSetptLimit>
                  <CoolLowerSetptLimit>15</CoolLowerSetptLimit>
                  <CoolUpperSetptLimit>35</CoolUpperSetptLimit>
                  <CanSetSwitchOff>1</CanSetSwitchOff>
                  <CanSetSwitchHeat>1</CanSetSwitchHeat>
                  <CanSetSwitchCool>1</CanSetSwitchCool>
                  <CanSetSwitchAuto>0</CanSetSwitchAuto>
                  <HeatNextPeriod>20</HeatNextPeriod>
                  <CoolNextPeriod>25</CoolNextPeriod>
                </UI>
                <EquipmentStatus>Cooling</EquipmentStatus>
              </ThermostatInfo>
              <ThermostatInfo>
                <ThermostatID>22222</ThermostatID>
                <UserDefinedDeviceName>Downstairs</UserDefinedDeviceName>
                <ModelTypeName>T5</ModelTypeName>
                <UI>
                  <DisplayedUnits>C</DisplayedUnits>
                  <DispTemperature>20</DispTemperature>
                  <HeatSetpoint>19</HeatSetpoint>
                  <CoolSetpoint>26</CoolSetpoint>
                  <SystemSwitchPosition>2</SystemSwitchPosition>
                  <OutdoorTemp>18</OutdoorTemp>
                  <OutdoorHumidity>55</OutdoorHumidity>
                  <IndoorHumidity>42</IndoorHumidity>
                  <HeatLowerSetptLimit>10</HeatLowerSetptLimit>
                  <HeatUpperSetptLimit>30</HeatUpperSetptLimit>
                  <CoolLowerSetptLimit>15</CoolLowerSetptLimit>
                  <CoolUpperSetptLimit>35</CoolUpperSetptLimit>
                  <CanSetSwitchOff>1</CanSetSwitchOff>
                  <CanSetSwitchHeat>1</CanSetSwitchHeat>
                  <CanSetSwitchCool>1</CanSetSwitchCool>
                  <CanSetSwitchAuto>0</CanSetSwitchAuto>
                  <HeatNextPeriod>18</HeatNextPeriod>
                  <CoolNextPeriod>27</CoolNextPeriod>
                </UI>
                <EquipmentStatus>Off</EquipmentStatus>
              </ThermostatInfo>
            </Thermostats>
          </LocationInfo>
        </Locations>
      </GetLocationsResult>
    </GetLocationsResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedMultiple = xmlParser.parse(getLocationsResponseMultiple);
const multipleResult = parsedMultiple["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;
const normalizedMultiple = tccMessage.normalizeToHb(multipleResult.Locations);

assert(normalizedMultiple.hb['11111'] !== undefined, 'First thermostat (11111) exists');
assert(normalizedMultiple.hb['22222'] !== undefined, 'Second thermostat (22222) exists');
assertEqual(normalizedMultiple.hb['11111'].Name, 'Upstairs', 'First thermostat name correct');
assertEqual(normalizedMultiple.hb['22222'].Name, 'Downstairs', 'Second thermostat name correct');

// Test Celsius units (no conversion needed)
assertEqual(normalizedMultiple.hb['11111'].CurrentTemperature, 22.5, 'Celsius temperature not converted');
assertEqual(normalizedMultiple.hb['11111'].HeatingThresholdTemperature, 21, 'Celsius heat setpoint not converted');

// Test SystemSwitchPosition 3 = Cool = HomeKit state 2
assertEqual(normalizedMultiple.hb['11111'].TargetHeatingCoolingState, 2, 'Cool mode maps to state 2');

// Test SystemSwitchPosition 2 = Off = HomeKit state 0
assertEqual(normalizedMultiple.hb['22222'].TargetHeatingCoolingState, 0, 'Off mode maps to state 0');

// Test EquipmentStatus "Cooling" = HomeKit state 2
assertEqual(normalizedMultiple.hb['11111'].CurrentHeatingCoolingState, 2, 'Currently cooling = state 2');

// Test valid values (CanSetSwitchAuto = 0 means no auto)
assertDeepEqual(normalizedMultiple.hb['11111'].TargetHeatingCoolingStateValidValues, [0, 1, 2], 'Valid states without auto');

// ============================================
// TEST 6: Temperature Conversion Edge Cases
// ============================================
console.log('\nTEST 6: Temperature Conversion Edge Cases');

// Create mock thermostat for testing
const mockThermostatF = {
  UI: {
    DisplayedUnits: "F",
    DispTemperature: 0,
    HeatSetpoint: 32,
    CoolSetpoint: 212,
    OutdoorTemp: -40
  }
};

const mockThermostatC = {
  UI: {
    DisplayedUnits: "C",
    DispTemperature: 0,
    HeatSetpoint: -10,
    CoolSetpoint: 100
  }
};

// Test the toCelcius function indirectly through toHb
const thermostatObjF = {
  ThermostatID: 99999,
  UserDefinedDeviceName: "Test F",
  ModelTypeName: "Test",
  UI: {
    DisplayedUnits: "F",
    DispTemperature: 0,
    HeatSetpoint: 32,
    CoolSetpoint: 212,
    SystemSwitchPosition: 1,
    OutdoorTemp: -40,
    OutdoorHumidity: 50,
    IndoorHumidity: 45,
    HeatLowerSetptLimit: 40,
    HeatUpperSetptLimit: 90,
    CoolLowerSetptLimit: 50,
    CoolUpperSetptLimit: 99,
    CanSetSwitchOff: 1,
    CanSetSwitchHeat: 1,
    CanSetSwitchCool: 1,
    CanSetSwitchAuto: 1,
    HeatNextPeriod: 70,
    CoolNextPeriod: 75
  },
  EquipmentStatus: "Off"
};

const convertedF = tccMessage.toHb(thermostatObjF);
assertEqual(convertedF.CurrentTemperature, parseFloat(((-32) * 5 / 9).toFixed(1)), '0°F converts to -17.8°C');
assertEqual(convertedF.HeatingThresholdTemperature, 0, '32°F converts to 0°C');
assertEqual(convertedF.CoolingThresholdTemperature, 100, '212°F converts to 100°C');
assertEqual(convertedF.OutsideTemperature, -40, '-40°F converts to -40°C');

const thermostatObjC = {
  ThermostatID: 99998,
  UserDefinedDeviceName: "Test C",
  ModelTypeName: "Test",
  UI: {
    DisplayedUnits: "C",
    DispTemperature: 0,
    HeatSetpoint: -10,
    CoolSetpoint: 100,
    SystemSwitchPosition: 1,
    OutdoorTemp: 0,
    OutdoorHumidity: 50,
    IndoorHumidity: 45,
    HeatLowerSetptLimit: -20,
    HeatUpperSetptLimit: 30,
    CoolLowerSetptLimit: 10,
    CoolUpperSetptLimit: 40,
    CanSetSwitchOff: 1,
    CanSetSwitchHeat: 1,
    CanSetSwitchCool: 1,
    CanSetSwitchAuto: 1,
    HeatNextPeriod: 18,
    CoolNextPeriod: 25
  },
  EquipmentStatus: "Off"
};

const convertedC = tccMessage.toHb(thermostatObjC);
assertEqual(convertedC.CurrentTemperature, 0, '0°C stays 0°C');
assertEqual(convertedC.HeatingThresholdTemperature, -10, '-10°C stays -10°C');
assertEqual(convertedC.CoolingThresholdTemperature, 100, '100°C stays 100°C');

// ============================================
// TEST 7: ChangeThermostat Message Generation
// ============================================
console.log('\nTEST 7: ChangeThermostat Message');

const sessionID = "test-session-123";
const desiredState = {
  ThermostatID: 12345,
  TargetHeatingCooling: 1, // Heat mode
  TargetTemperature: 21 // 21°C
};

const thermostatState = {
  device: {
    UI: {
      DisplayedUnits: "C",
      HeatSetpoint: 20,
      CoolSetpoint: 25,
      SystemSwitchPosition: 2,
      HeatNextPeriod: 19,
      CoolNextPeriod: 26
    }
  }
};

try {
  const changeMsg = tccMessage.ChangeThermostatMessage(sessionID, desiredState, thermostatState, false);
  assert(changeMsg.ChangeThermostatUI !== undefined, 'ChangeThermostatUI object created');
  assertEqual(changeMsg.ChangeThermostatUI.sessionID.$t, sessionID, 'Session ID correct in change message');
  assertEqual(changeMsg.ChangeThermostatUI.thermostatID.$t, 12345, 'Thermostat ID correct');
  assertEqual(changeMsg.ChangeThermostatUI.systemSwitch.$t, 1, 'System switch set to Heat (1)');
  assertEqual(changeMsg.ChangeThermostatUI.statusHeat.$t, 1, 'Status heat set to temporary (1)');

  const changeXml = xmlBuilder.build(tccMessage.soapMessage(changeMsg));
  assert(changeXml.includes('ChangeThermostatUI'), 'ChangeThermostatUI in XML');
  assert(!changeXml.includes('$t='), 'No $t attributes in XML');
} catch (err) {
  console.error('✗ ChangeThermostat message generation failed:', err.message);
  testsFailed++;
}

// Test with permanent holds
try {
  const changeMsgPerm = tccMessage.ChangeThermostatMessage(sessionID, desiredState, thermostatState, true);
  assertEqual(changeMsgPerm.ChangeThermostatUI.statusHeat.$t, 2, 'Status heat set to permanent (2) when usePermanentHolds=true');
  assertEqual(changeMsgPerm.ChangeThermostatUI.statusCool.$t, 2, 'Status cool set to permanent (2) when usePermanentHolds=true');
} catch (err) {
  console.error('✗ ChangeThermostat with permanent holds failed:', err.message);
  testsFailed++;
}

// ============================================
// TEST 8: Edge Cases - Null/Undefined Data
// ============================================
console.log('\nTEST 8: Edge Cases - Null/Undefined Handling');

// Test empty/missing locations
try {
  const emptyLocations = { LocationInfo: null };
  const normalizedEmpty = tccMessage.normalizeToHb(emptyLocations);
  assertDeepEqual(normalizedEmpty.hb, {}, 'Empty locations returns empty hb object');
} catch (err) {
  console.error('✗ Empty locations handling failed:', err.message);
  testsFailed++;
}

// Test missing Thermostats
try {
  const missingThermostats = {
    LocationInfo: {
      Thermostats: null
    }
  };
  const normalizedMissing = tccMessage.normalizeToHb(missingThermostats);
  assertDeepEqual(normalizedMissing.hb, {}, 'Missing thermostats returns empty hb object');
} catch (err) {
  console.error('✗ Missing thermostats handling failed:', err.message);
  testsFailed++;
}

// Test invalid thermostat data in ChangeThermostatMessage
try {
  tccMessage.ChangeThermostatMessage(sessionID, desiredState, null, false);
  console.error('✗ ChangeThermostatMessage should throw error for null thermostat');
  testsFailed++;
} catch (err) {
  assert(err.message.includes('Invalid thermostat data'), 'Throws error for null thermostat in ChangeThermostatMessage');
}

try {
  tccMessage.ChangeThermostatMessage(sessionID, desiredState, { device: null }, false);
  console.error('✗ ChangeThermostatMessage should throw error for null device');
  testsFailed++;
} catch (err) {
  assert(err.message.includes('Invalid thermostat data'), 'Throws error for null device in ChangeThermostatMessage');
}

// ============================================
// TEST 9: System Switch Position Mappings
// ============================================
console.log('\nTEST 9: System Switch Position Mappings');

// TCC -> HomeKit mappings
// TCC: 0=Emergency Heat, 1=Heat, 2=Off, 3=Cool, 4=Auto Heat, 5=Auto Cool
// HomeKit: 0=Off, 1=Heat, 2=Cool, 3=Auto

const testPositions = [
  { tcc: 0, homekit: 1, name: 'Emergency Heat -> Heat' },
  { tcc: 1, homekit: 1, name: 'Heat -> Heat' },
  { tcc: 2, homekit: 0, name: 'Off -> Off' },
  { tcc: 3, homekit: 2, name: 'Cool -> Cool' },
  { tcc: 4, homekit: 3, name: 'Auto Heat -> Auto' },
  { tcc: 5, homekit: 3, name: 'Auto Cool -> Auto' }
];

testPositions.forEach(({ tcc, homekit, name }) => {
  const testThermostat = {
    ThermostatID: 99999,
    UserDefinedDeviceName: "Test",
    ModelTypeName: "Test",
    UI: {
      DisplayedUnits: "C",
      DispTemperature: 20,
      HeatSetpoint: 19,
      CoolSetpoint: 25,
      SystemSwitchPosition: tcc,
      OutdoorTemp: 15,
      OutdoorHumidity: 50,
      IndoorHumidity: 45,
      HeatLowerSetptLimit: 10,
      HeatUpperSetptLimit: 30,
      CoolLowerSetptLimit: 15,
      CoolUpperSetptLimit: 35,
      CanSetSwitchOff: 1,
      CanSetSwitchHeat: 1,
      CanSetSwitchCool: 1,
      CanSetSwitchAuto: 1,
      HeatNextPeriod: 18,
      CoolNextPeriod: 26
    },
    EquipmentStatus: "Off"
  };

  const converted = tccMessage.toHb(testThermostat);
  assertEqual(converted.TargetHeatingCoolingState, homekit, name);
});

// ============================================
// TEST 10: Equipment Status Mappings
// ============================================
console.log('\nTEST 10: Equipment Status Mappings');

const equipmentStatuses = [
  { status: 'Off', expected: 0, name: 'Off -> 0' },
  { status: 'Heating', expected: 1, name: 'Heating -> 1' },
  { status: 'Cooling', expected: 2, name: 'Cooling -> 2' }
];

equipmentStatuses.forEach(({ status, expected, name }) => {
  const testThermostat = {
    ThermostatID: 99999,
    UserDefinedDeviceName: "Test",
    ModelTypeName: "Test",
    UI: {
      DisplayedUnits: "C",
      DispTemperature: 20,
      HeatSetpoint: 19,
      CoolSetpoint: 25,
      SystemSwitchPosition: 1,
      OutdoorTemp: 15,
      OutdoorHumidity: 50,
      IndoorHumidity: 45,
      HeatLowerSetptLimit: 10,
      HeatUpperSetptLimit: 30,
      CoolLowerSetptLimit: 15,
      CoolUpperSetptLimit: 35,
      CanSetSwitchOff: 1,
      CanSetSwitchHeat: 1,
      CanSetSwitchCool: 1,
      CanSetSwitchAuto: 1,
      HeatNextPeriod: 18,
      CoolNextPeriod: 26
    },
    EquipmentStatus: status
  };

  const converted = tccMessage.toHb(testThermostat);
  assertEqual(converted.CurrentHeatingCoolingState, expected, name);
});

// ============================================
// TEST 11: GetCommTaskState Response
// ============================================
console.log('\nTEST 11: GetCommTaskState Response');

const commTaskSuccessResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCommTaskStateResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <GetCommTaskStateResult>
        <Result>Success</Result>
        <CommTaskID>task-12345</CommTaskID>
      </GetCommTaskStateResult>
    </GetCommTaskStateResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedCommTask = xmlParser.parse(commTaskSuccessResponse);
const commTaskResult = parsedCommTask["soap:Envelope"]["soap:Body"].GetCommTaskStateResponse.GetCommTaskStateResult;
assertEqual(commTaskResult.Result, "Success", 'CommTask result is Success');

// ============================================
// TEST 12: Error Response Handling
// ============================================
console.log('\nTEST 12: Error Response Handling');

const loginFailureResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AuthenticateUserLoginResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <AuthenticateUserLoginResult>
        <Result>InvalidCredentials</Result>
      </AuthenticateUserLoginResult>
    </AuthenticateUserLoginResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedLoginFailure = xmlParser.parse(loginFailureResponse);
const loginFailureResult = parsedLoginFailure["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse.AuthenticateUserLoginResult;
assertEqual(loginFailureResult.Result, "InvalidCredentials", 'Login failure result parsed correctly');
assert(loginFailureResult.SessionID === undefined, 'No session ID on failed login');

const invalidSessionResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetLocationsResponse xmlns="http://services.alarmnet.com/Services/MobileV2/">
      <GetLocationsResult>
        <Result>InvalidSessionID</Result>
      </GetLocationsResult>
    </GetLocationsResponse>
  </soap:Body>
</soap:Envelope>`;

const parsedInvalidSession = xmlParser.parse(invalidSessionResponse);
const invalidSessionResult = parsedInvalidSession["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;
assertEqual(invalidSessionResult.Result, "InvalidSessionID", 'InvalidSessionID error parsed correctly');

// ============================================
// TEST 13: Diff Function
// ============================================
console.log('\nTEST 13: Diff Function');

const obj1 = {
  name: "Test",
  value: 10,
  nested: {
    a: 1,
    b: 2
  }
};

const obj2 = {
  name: "Test",
  value: 20,
  nested: {
    a: 1,
    b: 3
  }
};

const difference = tccMessage.diff(obj1, obj2);
assertEqual(difference.value, 20, 'Diff detects changed value');
assertEqual(difference.nested.b, 3, 'Diff detects nested changed value');
assert(difference.name === undefined, 'Diff ignores unchanged values');
assert(difference.nested.a === undefined, 'Diff ignores unchanged nested values');

// ============================================
// TEST 14: Outside Humidity Special Value
// ============================================
console.log('\nTEST 14: Outside Humidity Special Value (128)');

const thermostatWithInvalidHumidity = {
  ThermostatID: 88888,
  UserDefinedDeviceName: "Test Invalid Humidity",
  ModelTypeName: "Test",
  UI: {
    DisplayedUnits: "F",
    DispTemperature: 70,
    HeatSetpoint: 68,
    CoolSetpoint: 75,
    SystemSwitchPosition: 1,
    OutdoorTemp: 60,
    OutdoorHumidity: 128, // Special value meaning invalid
    IndoorHumidity: 45,
    HeatLowerSetptLimit: 40,
    HeatUpperSetptLimit: 90,
    CoolLowerSetptLimit: 50,
    CoolUpperSetptLimit: 99,
    CanSetSwitchOff: 1,
    CanSetSwitchHeat: 1,
    CanSetSwitchCool: 1,
    CanSetSwitchAuto: 1,
    HeatNextPeriod: 65,
    CoolNextPeriod: 78
  },
  EquipmentStatus: "Off"
};

const convertedInvalidHumidity = tccMessage.toHb(thermostatWithInvalidHumidity);
assertEqual(convertedInvalidHumidity.OutsideHumidity, 128, 'Invalid humidity value (128) preserved');

// ============================================
// FINAL RESULTS
// ============================================
console.log('\n========================================');
console.log('TEST RESULTS');
console.log('========================================');
console.log(`✓ Passed: ${testsPassed}`);
console.log(`✗ Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);
console.log('========================================\n');

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED\n');
  process.exit(1);
}
