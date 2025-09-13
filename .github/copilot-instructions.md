# Homebridge TCC Plugin

Homebridge TCC is a Node.js plugin for Homebridge that connects North American Honeywell Total Connect Comfort thermostats to Apple HomeKit. The plugin communicates with Honeywell's cloud service to control and monitor thermostats.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Essential Setup Commands
- **NEVER CANCEL builds or tests** - They may take longer than expected but will complete
- `npm install` -- Takes 30 seconds. Installs dependencies with some deprecation warnings (expected)
- `npm ci` -- Takes 8 seconds. Clean install for CI environments  
- `npm audit fix` -- Takes 4 seconds. Fixes some security vulnerabilities (4 high severity remain due to xml2json dependency)

### Development and Testing Commands
- `npm run lint` -- Takes <1 second. **CURRENTLY FAILS** with 6 unused variable warnings. Lint must pass with `--max-warnings=0` but code has legitimate unused parameters
- `npm run lint:fix` -- Takes <1 second. Auto-fixes some issues but cannot resolve unused variable warnings
- `npm test` -- Takes <1 second. **NO TESTS EXIST** - exits with code 1 "No tests found"
- `npm run test-coverage` -- Takes <1 second. Same as test, no coverage available
- `npm run watch` -- **BROKEN** - hardcoded path `~/npm/bin/homebridge` doesn't exist in most environments

### Running the Plugin
- **ALWAYS install homebridge first**: `npm install -g homebridge` (takes 7 seconds)
- **Basic plugin test**: `DEBUG=tcc* homebridge -U /tmp -P .` (requires config.json in /tmp)
- **Development watch mode**: Currently broken due to hardcoded homebridge path in nodemon config

### Validation After Changes
- **ALWAYS run linting** despite current failures: `npm run lint`
- **ALWAYS test plugin loading**: Create test config and run homebridge to verify plugin loads
- **Manual validation scenarios**:
  1. Plugin loads successfully in homebridge
  2. Debug messages appear with `DEBUG=tcc*`
  3. Plugin attempts TCC service connection (will fail without valid credentials - this is expected)
  4. No JavaScript errors during plugin initialization

## Known Issues and Workarounds

### Linting Issues
- **6 unused variable warnings** block successful lint runs
- These appear to be legitimate unused parameters in function signatures
- **Workaround**: Acknowledge that lint fails but code functions correctly
- Locations of unused vars:
  - `src/index.js:448:29` - 'sensors' parameter
  - `src/index.js:606:10` - 'getAccessoryByThermostatID' function  
  - `src/lib/tcc.js:34:23` - 'callback' parameter
  - `src/lib/tccMessage.js:150,152,163` - loop variable 'i'

### Security Vulnerabilities
- **4 high severity vulnerabilities** remain after `npm audit fix`
- All related to xml2json dependency chain (hoek, joi, topo)
- These are in parsing dependencies, not core plugin functionality

### Watch Mode Issues
- **nodemon configuration broken** with hardcoded path `~/npm/bin/homebridge`
- Use manual homebridge execution instead of `npm run watch`

## Testing Plugin Functionality

### Create Test Configuration
```bash
# Create minimal test config
cat > /tmp/config.json << 'EOF'
{
  "bridge": {
    "name": "TestBridge", 
    "username": "AA:BB:CC:DD:EE:FF",
    "port": 51827,
    "pin": "031-45-154"
  },
  "plugins": ["homebridge-tcc"],
  "platforms": [{
    "platform": "tcc",
    "name": "Test TCC", 
    "username": "test@example.com",
    "password": "invalid_password",
    "debug": true,
    "refresh": 600
  }]
}
EOF
```

### Run Plugin Test
```bash
# Test plugin loading (expect connection failure - this is normal)
DEBUG=tcc* homebridge -U /tmp -P .
```

**Expected behavior**: 
- Plugin loads successfully
- Debug output shows "Setting up TCC component"
- Connection to tccna.resideo.com fails (normal without valid credentials)
- No JavaScript errors during initialization

## Repository Structure

### Key Files
- `src/index.js` - Main plugin entry point (774 lines)
- `src/lib/tcc.js` - TCC service communication library (406 lines) 
- `src/lib/tccMessage.js` - SOAP message formatting (251 lines)
- `package.json` - Dependencies and scripts
- `config.schema.json` - Homebridge configuration schema
- `eslint.config.mjs` - ESLint configuration (has unused var warnings)

### Configuration
- **Platform name**: "tcc"
- **Required config**: username, password (Honeywell credentials)
- **Optional config**: refresh interval, sensors, debug mode, permanent holds
- **Default refresh**: 600 seconds (10 minutes) - lower values trigger rate limiting

### Dependencies
- **Runtime**: homebridge (>= 1.6.0), easy-soap-request, xml2json, fakegato-history
- **Node.js**: Requires 18.20.4+, 20.15.1+, or 22.0.0+
- **Development**: eslint, jest, nodemon

## Common Development Tasks

### Making Code Changes
1. **Always run baseline tests first**: `npm install && npm run lint` (expect lint to fail)
2. **Test plugin loads**: Use homebridge test configuration above
3. **Check debug output**: Look for TCC-specific debug messages
4. **Verify no new JavaScript errors**: Plugin should initialize without throwing

### Before Committing
- **DO NOT** try to fix the 6 linting warnings unless specifically tasked to do so
- **DO** verify plugin still loads in homebridge after changes
- **DO** check that debug output appears correctly
- **AVOID** making changes to lint configuration or unused parameters without understanding their purpose

### Integration Points
- **Homebridge Platform API**: Plugin registers as platform "tcc"
- **HAP Protocol**: Exposes thermostat as HomeKit accessory
- **TCC Web Service**: SOAP requests to tccna.resideo.com
- **FakeGato**: Historical data logging for graphing

This plugin is production-ready but has development tooling issues (linting, testing, watch mode). Focus on functional changes rather than tooling fixes unless specifically required.