const soapRequest = require('easy-soap-request');
const parser = require('xml2json');

// example data

const url = 'https://tccna.honeywell.com/ws/MobileV2.asmx';
const sampleHeaders = {
  'user-agent': 'TCCStageC/1092 CFNetwork/1125.2 Darwin/19.4.0',
  'Content-Type': 'text/xml;charset=UTF-8',
  'soapAction': 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin',
  'ADRUM': 'isAjax:true',
  'Accept': '*/*',
  'Accept-Language': 'en-ca',
  'Accept-Encoding': 'gzip, deflate, br',
  'ADRUM_1': 'isMobile:true'
};

// SOAPAction	http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin

var xml = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://services.alarmnet.com/Services/MobileV2/"><soap:Body><AuthenticateUserLogin><username>.....</username><password>......</password><applicationID>357568d9-38ff-4fda-bfe2-46b0fa1dd864</applicationID><applicationVersion>2</applicationVersion><uiLanguage>Default</uiLanguage></AuthenticateUserLogin></soap:Body></soap:Envelope>';

xmlResponse = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><AuthenticateUserLoginResponse xmlns="http://services.alarmnet.com/Services/MobileV2/"><AuthenticateUserLoginResult><Result>Success</Result><UserInfo><UserID>1551651</UserID><UserName>.......</UserName><FirstName>.....</FirstName><LastName>.....</LastName><Language>en-US</Language><LatestEulaAccepted>true</LatestEulaAccepted></UserInfo><SessionID>8C9935EF-28DC-48BA-B4CD-B1FB444EC858</SessionID></AuthenticateUserLoginResult></AuthenticateUserLoginResponse></soap:Body></soap:Envelope>';

// SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetLocations

xml = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://services.alarmnet.com/Services/MobileV2/"><soap:Body><GetLocations><sessionID>A79B2892-27D3-4EC6-94AC-084FC10405D1</sessionID></GetLocations></soap:Body></soap:Envelope>';

// SOAPAction	http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI

xml = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://services.alarmnet.com/Services/MobileV2/"><soap:Body><ChangeThermostatUI><sessionID>A79B2892-27D3-4EC6-94AC-084FC10405D1</sessionID><thermostatID>.....</thermostatID><changeSystemSwitch>1</changeSystemSwitch><systemSwitch>1</systemSwitch><changeHeatSetpoint>1</changeHeatSetpoint><heatSetpoint>20</heatSetpoint><changeCoolSetpoint>1</changeCoolSetpoint><coolSetpoint>25.5</coolSetpoint><changeHeatNextPeriod>1</changeHeatNextPeriod><heatNextPeriod>86</heatNextPeriod><changeCoolNextPeriod>1</changeCoolNextPeriod><coolNextPeriod>86</coolNextPeriod><changeStatusHeat>1</changeStatusHeat><statusHeat>1</statusHeat><changeStatusCool>1</changeStatusCool><statusCool>1</statusCool></ChangeThermostatUI></soap:Body></soap:Envelope>';

xmlResponse = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><ChangeThermostatUIResponse xmlns="http://services.alarmnet.com/Services/MobileV2/"><ChangeThermostatUIResult><Result>Success</Result><CommTaskID>865990156</CommTaskID></ChangeThermostatUIResult></ChangeThermostatUIResponse></soap:Body></soap:Envelope>`;

// SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetThermostat

xml = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://services.alarmnet.com/Services/MobileV2/"><soap:Body><GetThermostat><sessionID>A79B2892-27D3-4EC6-94AC-084FC10405D1</sessionID><thermostatID>.....</thermostatID></GetThermostat></soap:Body></soap:Envelope>';

xmlResponse = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><GetThermostatResponse xmlns="http://services.alarmnet.com/Services/MobileV2/"><GetThermostatResult><Result>Success</Result><Thermostat><ThermostatID>.....</ThermostatID><MacID>.....</MacID><DomainID>.....</DomainID><Instance>0</Instance><DeviceName>THERMOSTAT</DeviceName><UserDefinedDeviceName>THERMOSTAT</UserDefinedDeviceName><Upgrading>false</Upgrading><ThermostatsAlerts /><UI><Created>2020-05-19T00:28:36.059148</Created><ThermostatLocked>false</ThermostatLocked><OutdoorTemp>128.0000</OutdoorTemp><DispTemperature>19.5000</DispTemperature><HeatSetpoint>19.5000</HeatSetpoint><CoolSetpoint>25.5000</CoolSetpoint><DisplayedUnits>C</DisplayedUnits><StatusHeat>1</StatusHeat><StatusCool>1</StatusCool><HoldUntilCapable>true</HoldUntilCapable><ScheduleCapable>true</ScheduleCapable><VacationHold>0</VacationHold><DualSetpointStatus>false</DualSetpointStatus><HeatNextPeriod>86</HeatNextPeriod><CoolNextPeriod>86</CoolNextPeriod><HeatLowerSetptLimit>4.5000</HeatLowerSetptLimit><HeatUpperSetptLimit>32.0000</HeatUpperSetptLimit><CoolLowerSetptLimit>10.0000</CoolLowerSetptLimit><CoolUpperSetptLimit>37.0000</CoolUpperSetptLimit><SchedHeatSp>20.0000</SchedHeatSp><SchedCoolSp>25.5000</SchedCoolSp><SystemSwitchPosition>1</SystemSwitchPosition><CanSetSwitchAuto>false</CanSetSwitchAuto><CanSetSwitchCool>true</CanSetSwitchCool><CanSetSwitchOff>true</CanSetSwitchOff><CanSetSwitchHeat>true</CanSetSwitchHeat><CanSetSwitchEmergencyHeat>false</CanSetSwitchEmergencyHeat><CanSetSwitchSouthernAway>false</CanSetSwitchSouthernAway><Deadband>0.0000</Deadband><OutdoorHumidity>128.0000</OutdoorHumidity><IndoorHumidity>128.0000</IndoorHumidity><Commercial>false</Commercial><SystemSwitchChangeSource><PartnerName>TCC</PartnerName></SystemSwitchChangeSource><HeatSetpointChangeSource><PartnerName>TCC</PartnerName></HeatSetpointChangeSource><CoolSetpointChangeSource><PartnerName>TCC</PartnerName></CoolSetpointChangeSource><VacationHoldChangeSource><ChangeTag /><PartnerName>Amazon Echo</PartnerName></VacationHoldChangeSource></UI><Fan><CanControl>true</CanControl><Position>Auto</Position><CanSetAuto>true</CanSetAuto><CanSetCirculate>false</CanSetCirculate><CanFollowSchedule>false</CanFollowSchedule><CanSetOn>true</CanSetOn><IsFanRunning>false</IsFanRunning></Fan><Humidification><CanControlHumidification>false</CanControlHumidification><CanControlDehumidification>false</CanControlDehumidification><HumidificationSetPoint>35</HumidificationSetPoint><HumidificationUpperLimit>0</HumidificationUpperLimit><HumidificationLowerLimit>0</HumidificationLowerLimit><HumidificationMode>Off</HumidificationMode><DehumidificationSetPoint>50</DehumidificationSetPoint><DehumidificationUpperLimit>0</DehumidificationUpperLimit><DehumidificationLowerLimit>0</DehumidificationLowerLimit><DehumidificationMode>Off</DehumidificationMode><Deadband>255</Deadband></Humidification><EquipmentStatus>Off</EquipmentStatus><CanControlSchedule>true</CanControlSchedule><WillSupportSchedule>false</WillSupportSchedule><ModelTypeID>3</ModelTypeID><ModelTypeName>Communicating Vision PRO Retail</ModelTypeName></Thermostat></GetThermostatResult></GetThermostatResponse></soap:Body></soap:Envelope>`;

// SOAPAction	http://services.alarmnet.com/Services/MobileV2/GetCommTaskState

// xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://services.alarmnet.com/Services/MobileV2/"><soap:Body><GetCommTaskState><sessionID>A79B2892-27D3-4EC6-94AC-084FC10405D1</sessionID><commTaskID>865990156</commTaskID></GetCommTaskState></soap:Body></soap:Envelope>`;


// xmlResponse = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><GetCommTaskStateResponse xmlns="http://services.alarmnet.com/Services/MobileV2/"><GetCommTaskStateResult><Result>Success</Result><CommTaskID>865990156</CommTaskID><State>Running</State><FaultReason>GatewayNotFound</FaultReason></GetCommTaskStateResult></GetCommTaskStateResponse></soap:Body></soap:Envelope>`;

var AuthenticateUserLogin = {
  AuthenticateUserLogin: {
    username: {
      $t: "......."
    },
    password: {
      $t: "......"
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
};

console.log("to json -> %s", JSON.stringify(parser.toJson(xml, {
  object: true,
  reversible: false,
  coerce: true,
  sanitize: false,
  trim: true,
  arrayNotation: false,
  alternateTextNode: false
}), null, 2));

console.log("to reversible json -> %s", JSON.stringify(parser.toJson(xml, {
  object: true,
  reversible: true,
  coerce: true,
  sanitize: false,
  trim: true,
  arrayNotation: false,
  alternateTextNode: false
}), null, 2));

console.log("to json -> %s", JSON.stringify(parser.toJson(xmlResponse, {
  object: true,
  reversible: false,
  coerce: true,
  sanitize: false,
  trim: true,
  arrayNotation: false,
  alternateTextNode: false
}), null, 2));

console.log("to reversible json -> %s", JSON.stringify(parser.toJson(xmlResponse, {
  object: true,
  reversible: true,
  coerce: true,
  sanitize: false,
  trim: true,
  arrayNotation: false,
  alternateTextNode: false
}), null, 2));

/*
var AuthenticateUserLoginResponse = parser.toJson(xml, {
  object: true,
  reversible: false,
  coerce: true,
  sanitize: false,
  trim: true,
  arrayNotation: false,
  alternateTextNode: false
})["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;


console.log("RESPONSE", JSON.stringify(AuthenticateUserLoginResponse, null, 2));

console.log("Success", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result);

console.log("SessionID", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID);
*/

/*
console.log("Orig");
console.log(xml);
console.log("Built");
console.log('<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLogin)));
*/

/*
// usage of module
(async () => {
  var {
    response
  } = await soapRequest({
    url: url,
    headers: sampleHeaders,
    xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(AuthenticateUserLogin)),
    timeout: 1000
  }); // Optional timeout parameter(milliseconds)

  // console.log("Response", response.headers);
  console.log("statusCode", response.statusCode);

  console.log(JSON.stringify(parser.toJson(response.body, {
    object: true,
    reversible: false,
    coerce: true,
    sanitize: false,
    trim: true,
    arrayNotation: false,
    alternateTextNode: false
  }), null, 2));

  console.log('--------------');

  var AuthenticateUserLoginResponse = parser.toJson(response.body, {
    object: true,
    reversible: false,
    coerce: true,
    sanitize: false,
    trim: true,
    arrayNotation: false,
    alternateTextNode: false
  })["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;

  var sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;

  console.log("Success", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result);

  var GetLocations = {
    GetLocations: {
      sessionID: {
        $t: sessionID
      }
    }
  };

  if (AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result === "Success") {
    console.log('--------------  GetLocations  --------------', sessionID);
    sampleHeaders.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
    response = await soapRequest({
      url: url,
      headers: sampleHeaders,
      xml: '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(soapMessage(GetLocations)),
      timeout: 1000
    }); // Optional timeout parameter(milliseconds)
    // console.log("Response", response.response);
    console.log("statusCode", response.response.statusCode);

    console.log(JSON.stringify(parser.toJson(response.response.body, {
      object: true,
      reversible: false,
      coerce: true,
      sanitize: false,
      trim: true,
      arrayNotation: false,
      alternateTextNode: false
    })["soap:Envelope"]["soap:Body"], null, 2));

    console.log('--------------');
  }
})();

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

var GetLocationsResponse = {
  "GetLocationsResponse": {
    "xmlns": "http://services.alarmnet.com/Services/MobileV2/",
    "GetLocationsResult": {
      "Result": "Success",
      "Locations": {
        "LocationInfo": {
          "LocationID": .....,
          "CanControl": true,
          "Name": "Home",
          "Type": "R",
          "Country": "CA",
          "ZipCode": ".....",
          "CurrentWeather": {
            "IsDefined": true,
            "IsValid": true,
            "Condition": "Showers",
            "Temperature": 11.1,
            "TempUnit": "Celsius",
            "Humidity": 76,
            "PhraseKey": "Light rain"
          },
          "Thermostats": {
            "ThermostatInfo": {
              "ThermostatID": .....,
              "MacID": ".....",
              "DomainID": .....,
              "Instance": 0,
              "DeviceName": "THERMOSTAT",
              "UserDefinedDeviceName": "THERMOSTAT",
              "Upgrading": false,
              "ThermostatsAlerts": {},
              "UI": {
                "Created": "2020-05-19T01:30:00",
                "ThermostatLocked": false,
                "OutdoorTemp": 128,
                "DispTemperature": 20,
                "HeatSetpoint": 16.5,
                "CoolSetpoint": 28,
                "DisplayedUnits": "C",
                "StatusHeat": 0,
                "StatusCool": 0,
                "HoldUntilCapable": true,
                "ScheduleCapable": true,
                "VacationHold": 0,
                "DualSetpointStatus": false,
                "HeatNextPeriod": 26,
                "CoolNextPeriod": 26,
                "HeatLowerSetptLimit": 4.5,
                "HeatUpperSetptLimit": 32,
                "CoolLowerSetptLimit": 10,
                "CoolUpperSetptLimit": 37,
                "SchedHeatSp": 16.5,
                "SchedCoolSp": 28,
                "SystemSwitchPosition": 1,
                "CanSetSwitchAuto": false,
                "CanSetSwitchCool": true,
                "CanSetSwitchOff": true,
                "CanSetSwitchHeat": true,
                "CanSetSwitchEmergencyHeat": false,
                "CanSetSwitchSouthernAway": false,
                "Deadband": 0,
                "OutdoorHumidity": 128,
                "IndoorHumidity": 128,
                "Commercial": false,
                "SystemSwitchChangeSource": {
                  "PartnerName": "TCC"
                },
                "VacationHoldChangeSource": {
                  "ChangeTag": {},
                  "PartnerName": "Amazon Echo"
                }
              },
              "Fan": {
                "CanControl": true,
                "Position": "Auto",
                "CanSetAuto": true,
                "CanSetCirculate": false,
                "CanFollowSchedule": false,
                "CanSetOn": true,
                "IsFanRunning": false
              },
              "Humidification": {
                "CanControlHumidification": false,
                "CanControlDehumidification": false,
                "HumidificationSetPoint": 35,
                "HumidificationUpperLimit": 0,
                "HumidificationLowerLimit": 0,
                "HumidificationMode": "Off",
                "DehumidificationSetPoint": 50,
                "DehumidificationUpperLimit": 0,
                "DehumidificationLowerLimit": 0,
                "DehumidificationMode": "Off",
                "Deadband": 255
              },
              "EquipmentStatus": "Off",
              "CanControlSchedule": true,
              "WillSupportSchedule": false,
              "ModelTypeID": 3,
              "ModelTypeName": "Communicating Vision PRO Retail"
            }
          },
          "TimeZone": "Eastern"
        }
      },
      "SiteAlerts": {}
    }
  }
};
*/
