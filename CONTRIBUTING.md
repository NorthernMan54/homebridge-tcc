# Contributing to homebridge-tcc

Thank you for your interest in contributing to homebridge-tcc! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Structure](#code-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Areas Needing Help](#areas-needing-help)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all interactions.

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

---

## Getting Started

### Prerequisites

- **Node.js**: 18.20.4+, 20.15.1+, or 22.20.0+
- **Homebridge**: 1.6.0+ (for testing)
- **Git**: For version control
- **A Honeywell TCC account** (for testing)
- **A thermostat** (for integration testing, optional)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/homebridge-tcc.git
   cd homebridge-tcc
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/thindiyeh/homebridge-tcc.git
   ```

---

## Development Setup

### Install Dependencies

```bash
npm install
```

### Link for Local Testing

```bash
# Link plugin globally
npm link

# In your Homebridge directory
cd ~/.homebridge
npm link homebridge-tcc
```

### Run Tests

```bash
npm test                # Run all tests
npm run test-coverage   # Run with coverage
npm run lint            # Check code style
```

### Development Mode

```bash
# Watch mode (auto-reload on changes)
npm run watch
```

This runs Homebridge with:
- Auto-restart on file changes
- Debug logging enabled
- Test configuration

---

## Code Structure

### Directory Layout

```
src/
├── index.js                 # Entry point (minimal)
├── platform.js              # Main platform coordinator
├── accessories/             # HAP accessory implementations
│   ├── tccThermostatAccessory.js
│   └── tccSensorsAccessory.js
├── handlers/                # Characteristic get/set handlers
│   ├── characteristicHandlers.js
│   └── errorHandler.js
├── helpers/                 # Utility classes
│   ├── changeThermostat.js
│   └── serviceManager.js
└── lib/                     # Core functionality
    ├── tcc.js               # TCC API client
    ├── tccMessage.js        # SOAP message building
    └── logger.js            # Logging framework
```

### Module Responsibilities

- **index.js**: Plugin registration only
- **platform.js**: Lifecycle, coordination, state management
- **accessories/**: HAP service/characteristic setup
- **handlers/**: HomeKit callback implementations
- **helpers/**: Reusable utilities
- **lib/**: API communication, data transformation

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/bug-description
```

Branch naming:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Test improvements

### 2. Make Changes

- Follow [Coding Standards](#coding-standards)
- Write tests for new functionality
- Update documentation as needed
- Keep commits atomic and focused

### 3. Test Thoroughly

```bash
# Run test suite
npm test

# Check code style
npm run lint

# Fix linting issues
npm run lint:fix

# Test with real Homebridge
npm run watch
```

### 4. Commit

Use clear, descriptive commit messages:

```
feat: add support for geofencing

- Implement geofencing logic in platform.js
- Add configuration options
- Add tests for geofencing scenarios
- Update README with new feature

Closes #123
```

Commit message format:
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, missing semicolons, etc.
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance tasks

### 5. Push and Pull Request

```bash
git push origin feature/my-new-feature
```

Then open a pull request on GitHub.

---

## Testing

### Test Philosophy

- **Fast**: Tests should run quickly (<1 second total)
- **Isolated**: No network calls, no file system (except where necessary)
- **Deterministic**: Same input = same output every time
- **Comprehensive**: Cover happy path, edge cases, and error conditions

### Writing Tests

Create test files in `__tests__/` directory:

```javascript
describe('MyFeature', () => {
  describe('someFunction', () => {
    it('should handle valid input', () => {
      const result = someFunction(validInput);
      expect(result).toBe(expectedOutput);
    });

    it('should throw on invalid input', () => {
      expect(() => someFunction(invalidInput)).toThrow();
    });
  });
});
```

### Test Coverage

Run coverage report:
```bash
npm run test-coverage
```

We aim for:
- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

Currently, `tccMessage.js` has 100% coverage. New code should maintain this standard.

### Integration Testing

For testing with real thermostats:

1. Use test configuration:
   ```json
   {
     "platform": "tcc",
     "username": "test@example.com",
     "password": "password",
     "debug": true
   }
   ```

2. Run with debug logging:
   ```bash
   DEBUG=tcc* homebridge -D
   ```

3. Monitor logs for errors

4. Test all scenarios:
   - Temperature changes
   - Mode switching
   - Emergency heat
   - Sensor readings
   - Error recovery

---

## Pull Request Process

### Before Submitting

- ✅ All tests pass (`npm test`)
- ✅ No linting errors (`npm run lint`)
- ✅ Code is documented (JSDoc comments)
- ✅ README updated (if needed)
- ✅ TESTING.md updated (if adding tests)
- ✅ Commit messages are clear

### PR Template

```markdown
## Description
Brief description of changes

## Motivation and Context
Why is this change needed? What problem does it solve?

## Testing
How has this been tested?

- [ ] Unit tests added/updated
- [ ] Integration tests performed
- [ ] Tested with real thermostat

## Types of Changes
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)

## Checklist
- [ ] Code follows project style
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] All tests passing
- [ ] No linting errors
```

### Review Process

1. **Automated Checks**: GitHub Actions will run tests and linting
2. **Code Review**: Maintainers will review your code
3. **Discussion**: Address feedback and make changes if needed
4. **Approval**: Once approved, your PR will be merged

### After Merge

1. Delete your branch (optional)
2. Update your local main:
   ```bash
   git checkout main
   git pull upstream main
   ```

---

## Coding Standards

### General Principles

- **Clarity over Cleverness**: Code should be easy to understand
- **Consistent Style**: Follow existing patterns
- **Minimal Dependencies**: Only add dependencies when necessary
- **Error Handling**: Always handle errors gracefully
- **Documentation**: Document public APIs and complex logic

### JavaScript Style

We use ESLint with the following rules:

```javascript
// ✅ Good
const myVariable = 'value';
function myFunction(param) {
  return param + 1;
}

// ❌ Bad
var myVariable = "value"
function myFunction(param){return param+1}
```

**Key Points**:
- Use `const` by default, `let` when needed, never `var`
- Single quotes for strings
- Semicolons required
- 2-space indentation
- No trailing whitespace
- Descriptive variable names

### JSDoc Comments

Document all public functions:

```javascript
/**
 * Brief description of what this function does
 *
 * @param {string} name - Description of parameter
 * @param {number} value - Description of parameter
 * @returns {Object} Description of return value
 * @throws {Error} When something goes wrong
 *
 * @example
 * const result = myFunction('test', 42);
 * // result => { name: 'test', value: 42 }
 */
function myFunction(name, value) {
  if (!name) {
    throw new Error('Name is required');
  }
  return { name, value };
}
```

### Promises and Async

- Use `async`/`await` for asynchronous code
- Always handle promise rejections
- Use `try`/`catch` for error handling

```javascript
// ✅ Good
async function fetchData() {
  try {
    const data = await apiCall();
    return data;
  } catch (error) {
    logger.error('Failed to fetch data:', error);
    throw error;
  }
}

// ❌ Bad
function fetchData() {
  return apiCall().then(data => data); // No error handling
}
```

### Error Handling

- Catch errors at appropriate boundaries
- Log errors with context
- Provide meaningful error messages
- Don't swallow errors

```javascript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  this.logger.error('Operation failed:', error.message);
  throw new Error(`Failed to complete operation: ${error.message}`);
}

// ❌ Bad
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  // Silent failure
}
```

### Logging

Use structured logging:

```javascript
// ✅ Good
this.logger.info('Temperature changed to %s°C', temperature);
this.logger.debug('Full state:', { state });

// ❌ Bad
console.log('temp is ' + temperature);
```

Log levels:
- **info**: User-relevant events (changes, status)
- **warn**: Recoverable errors, rate limits
- **error**: Failures, exceptions
- **debug**: Detailed troubleshooting info

---

## Areas Needing Help

### High Priority

1. **Testing with Different Models**
   - We need reports from users with various thermostat models
   - Document compatibility and any model-specific issues

2. **International TCC Support**
   - European/Asian TCC API is different
   - Needs investigation and implementation

3. **Documentation Improvements**
   - More examples
   - Troubleshooting scenarios
   - Video tutorials

### Medium Priority

4. **Performance Optimization**
   - Reduce memory usage
   - Optimize polling strategies
   - Cache improvements

5. **Additional Features**
   - Geofencing integration
   - Advanced scheduling
   - Zone controller support
   - Fan control (if supported by API)

6. **Error Recovery**
   - Better handling of network issues
   - Automatic retry strategies
   - Rate limit detection

### Low Priority

7. **Code Quality**
   - Increase test coverage
   - Refactoring opportunities
   - TypeScript migration (future)

8. **Tooling**
   - Better development experience
   - Automated testing in CI
   - Release automation

---

## Communication

### Getting Help

- **Issues**: [GitHub Issues](https://github.com/thindiyeh/homebridge-tcc/issues)
- **Discussions**: [GitHub Discussions](https://github.com/thindiyeh/homebridge-tcc/discussions)
- **Homebridge Discord**: [#plugins channel](https://discord.gg/kqNCe2D)

### Reporting Bugs

When reporting bugs, include:

1. **Description**: What happened vs. what you expected
2. **Steps to Reproduce**: Detailed steps
3. **Environment**:
   - Plugin version
   - Homebridge version
   - Node.js version
   - Operating system
4. **Logs**: Relevant log output (with `debug: true`)
5. **Configuration**: Your config (remove sensitive data)

### Feature Requests

When requesting features:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: How you envision it working
3. **Alternatives**: Other approaches you've considered
4. **Impact**: Who else might benefit from this

---

## Release Process

(For maintainers)

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **Major** (x.0.0): Breaking changes
- **Minor** (0.x.0): New features, backward compatible
- **Patch** (0.0.x): Bug fixes

### Steps

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Commit: `chore: release vX.Y.Z`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. Create GitHub release with notes
7. Publish to npm: `npm publish`

---

## Recognition

Contributors will be recognized in:
- README.md credits section
- GitHub contributors page
- Release notes (for significant contributions)

---

## Questions?

Don't hesitate to ask! Open an issue or discussion, and we'll be happy to help.

Thank you for contributing to homebridge-tcc! 🎉

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-24
**Maintainer**: @thindiyeh
