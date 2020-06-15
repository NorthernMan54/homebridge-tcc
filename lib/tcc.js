const soapRequest = require('easy-soap-request');
const parser = require('xml2json');
var tccMessage = require('tccMessage');
var debug = require('debug')('tcc-lib');

// var thermostats = {};

const URL = 'https://tccna.honeywell.com/ws/MobileV2.asmx';

var HEADER = {
  'user-agent': 'TCCStageC/1092 CFNetwork/1125.2 Darwin/19.4.0',
  'Content-Type': 'text/xml;charset=UTF-8',
  'ADRUM': 'isAjax:true',
  'Accept': '*/*',
  'Accept-Language': 'en-ca',
  'Accept-Encoding': 'gzip, deflate, br',
  'ADRUM_1': 'isMobile:true'
};

module.exports = {
  tcc: tcc
};

function tcc(options, callback) {
  if (options.debug) {
    debug.enabled = true;
  }
  debug("Setting up TCC component");
  this._username = options.username;
  this._password = options.password;
  this._refresh = options.refresh;
  this.sessionID = null;
  this.timeout = 5000; // SOAP request timeout
  this.usePermanentHolds = options.usePermanentHolds;
  this.desiredState = {};
  this.deferrals = [];
  this.updating = false;
  this.waitTimeUpdate = 100;
  this.thermostats = {};
}

tcc.prototype.pollThermostat = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
          debug("TCC - Login Succeeded");
        }
        var current = await this._GetLocationListData();
        if (this.thermostats.LocationInfo && current.LocationInfo) {
          debug("pollThermostat - delta", JSON.stringify(tccMessage.diff(this.thermostats, current), null, 2));
        }
        this.thermostats = current;
        resolve(current);
      } catch (err) {
        // console.error("pollThermostat Error:", err.message);
        debug("pollThermostat Error:", err);
        reject(err);
      }
    })();
  });
};

tcc.prototype.ChangeThermostat = function(accessory, state) {
  return new Promise((resolve, reject) => {
    for (const key in state) {
      // console.log("ChangeThermostat", accessory);
      this.desiredState.ThermostatID = accessory.context.ThermostatID;
      this.desiredState[key] = state[key];
    }
    const d = {
      resolve: resolve,
      reject: reject
    };
    this.deferrals.push(d);
    if (this.updating) {
      return;
    }
    this.updating = true;
    if (this.waitTimeUpdate > 0) {
      setTimeout(() => {
        this._put();
      }, this.waitTimeUpdate);
    } else {
      this._put();
    }
  });
};

tcc.prototype._put = function() {
  const desiredState = this.desiredState;
  const deferrals = this.deferrals;
  this.desiredState = {};
  this.deferrals = [];
  this.updating = false;
  debug("_put()", desiredState);
  (async () => {
    try {
      var CommTaskID = await this._UpdateThermostat(desiredState);
      await this._GetCommTaskState(CommTaskID);
      var thermostat = await this._GetThermostat(desiredState.ThermostatID);
      this.recentlyUpdated = true;
      for (const d of deferrals) {
        d.resolve(thermostat);
      }
      setTimeout(() => {
        this.recentlyUpdated = false;
      }, 500);
    } catch (err) {
      console.error("_put Error:", err);
      this.sessionID = null;
      for (const d of deferrals) {
        d.reject(err);
      }
    }
  })();
};

tcc.prototype._UpdateThermostat = function(desiredState) {
  debug("_UpdateThermostat()", desiredState);
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        if (!this.sessionID) {
          this.sessionID = await this._login();
        }
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/ChangeThermostatUI';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds)));
        debug("_UpdateThermostat: SOAP Message", message, this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var ChangeThermostat = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].ChangeThermostatUIResponse.ChangeThermostatUIResult;
          // debug("_UpdateThermostat", ChangeThermostat);
          if (ChangeThermostat.Result === "Success") {
            debug("Success: _UpdateThermostat %s", ChangeThermostat, message);
            resolve(ChangeThermostat.CommTaskID);
          } else {
            this.sessionID = null;
            debug("ERROR: _UpdateThermostat %s", ChangeThermostat.Result, message);
            reject(new Error("ERROR: _UpdateThermostat %s", ChangeThermostat.Result));
          }
        } else {
          debug("ERROR: _UpdateThermostat %s", response, message);
          reject(new Error("ERROR: _UpdateThermostat %s", ChangeThermostat.Result));
        }
      } catch (err) {
        // console.error("_UpdateThermostat Error:", err);
        debug("_UpdateThermostat message", parser.toXml(tccMessage.soapMessage(tccMessage.ChangeThermostatMessage(this.sessionID, desiredState, this.thermostats.hb[desiredState.ThermostatID], this.usePermanentHolds))));
        reject(err);
        this.sessionID = null;
      }
    })();
  });
};

tcc.prototype._login = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/AuthenticateUserLogin';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.AuthenticateUserLoginMessage(this._username, this._password)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var AuthenticateUserLoginResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].AuthenticateUserLoginResponse;
          if (AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result === "Success") {
            resolve(AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID);
          } else {
            debug("ERROR: Login Failed %s", AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result, message);
            reject(new Error("ERROR: Login Failed" + AuthenticateUserLoginResponse.AuthenticateUserLoginResult.Result));
          }
        } else {
          debug("ERROR: Login Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: Login Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

tcc.prototype._GetCommTaskState = function(CommTaskID) {
  // SOAPAction http://services.alarmnet.com/Services/MobileV2/GetCommTaskState
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetCommTaskState';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetCommTaskStateMessage(this.sessionID, CommTaskID)));
        // debug("_GetCommTaskState", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetCommTaskState", response.statusCode, response.body);
        if (response.statusCode === 200) {
          var GetCommTaskStateResponse = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetCommTaskStateResponse;
          if (GetCommTaskStateResponse.GetCommTaskStateResult.Result === "Success") {
            debug("GetCommTaskState Success %s", GetCommTaskStateResponse.GetCommTaskStateResult);
            resolve();
          } else {
            debug("ERROR: GetCommTaskState Failed %s", GetCommTaskStateResponse.GetCommTaskStateResult, message);
            reject(new Error("ERROR: GetCommTaskState Failed" + GetCommTaskStateResponse.GetCommTaskStateResult.Result));
          }
        } else {
          debug("ERROR: GetCommTaskState Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetCommTaskState Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

tcc.prototype._GetThermostat = function(ThermostatID) {
  // SOAPAction http://services.alarmnet.com/Services/MobileV2/GetThermostat
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetThermostat';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetThermostatMessage(this.sessionID, ThermostatID)));
        // debug("_GetThermostat", message);
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        // debug("_GetThermostat", response.statusCode, response.body);
        if (response.statusCode === 200) {
          var GetThermostatResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetThermostatResponse.GetThermostatResult;
          // debug("GetThermostatResult", GetThermostatResult);
          if (GetThermostatResult.Result === "Success") {
            // debug("_GetThermostat - delta", JSON.stringify(diff(GetThermostatResult.Thermostat, this.thermostats.hb[ThermostatID.toString()]), null, 2));
            this.thermostats.hb[ThermostatID.toString()] = tccMessage.toHb(GetThermostatResult.Thermostat);
            // debug("_GetThermostat Temp %s Switch %s", toHb(GetThermostatResult.Thermostat).TargetTemperature, toHb(GetThermostatResult.Thermostat).TargetHeatingCoolingState);
            resolve(tccMessage.toHb(GetThermostatResult.Thermostat));
          } else {
            debug("ERROR: GetThermostat Failed %s", GetThermostatResult.Result, message);
            reject(new Error("ERROR: GetThermostat Failed" + GetThermostatResult.Result));
          }
        } else {
          debug("ERROR: GetThermostat Response Status Code", response.statusCode, message);
          reject(new Error("ERROR: GetThermostat Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("login Error:", err.message);
        reject(err);
      }
    })();
  });
};

tcc.prototype._GetLocationListData = function() {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        HEADER.soapAction = 'http://services.alarmnet.com/Services/MobileV2/GetLocations';
        var message = '<?xml version="1.0" encoding="utf-8"?>' + parser.toXml(tccMessage.soapMessage(tccMessage.GetLocationsMessage(this.sessionID)));
        // debug("SOAP Message", parser.toXml(soapMessage(GetLocations)));
        var {
          response
        } = await soapRequest({
          url: URL,
          headers: HEADER,
          xml: message,
          timeout: this.timeout,
          withCredentials: true
        });
        if (response.statusCode === 200) {
          var GetLocationsResult = parser.toJson(response.body, {
            object: true,
            reversible: false,
            coerce: true,
            sanitize: false,
            trim: true,
            arrayNotation: false,
            alternateTextNode: false
          })["soap:Envelope"]["soap:Body"].GetLocationsResponse.GetLocationsResult;

          if (GetLocationsResult.Result === "Success" && GetLocationsResult.Locations.LocationInfo) {
            // this.sessionID = AuthenticateUserLoginResponse.AuthenticateUserLoginResult.SessionID;
            // debug("_GetLocationListData", JSON.stringify(GetLocationsResult, null, 2));
            // debug("_GetLocationListData-2", GetLocationsResult.Locations.LocationInfo);
            resolve(tccMessage.normalizeToHb(GetLocationsResult.Locations));
          } else {
            this.sessionID = null;
            debug("ERROR: GetLocations %s", GetLocationsResult.Result, message);
            reject(new Error("GetLocations " + GetLocationsResult.Result));
          }
        } else {
          reject(new Error("ERROR: GetLocations Response Status Code", response.statusCode));
        }
      } catch (err) {
        // console.error("GetLocations Error:", err.message);
        this.sessionID = null;
        reject(err);
      }
    })();
  });
};
