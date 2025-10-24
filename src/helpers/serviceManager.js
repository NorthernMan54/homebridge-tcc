'use strict';

/**
 * Service Management Utilities
 *
 * These utilities help manage HomeKit services on accessories,
 * including registration, unregistration, and cleanup of unsupported services.
 */

/**
 * Removes services from an accessory that are not in the managed list
 * and not in the fallback allowed list.
 *
 * @param {object} accessory - The HomeKit accessory
 * @param {object} logger - Logger instance for logging operations
 * @param {object} Service - HomeKit Service class
 */
function pruneUnsupportedServices(accessory, logger, Service) {
  if (!accessory || !accessory.services) {
    return;
  }

  const managedList = accessory.context.managedServiceUUIDs || [];
  const managedSet = new Set(managedList);
  const legacyServiceUUIDs = new Set([
    Service.Fan && Service.Fan.UUID,
    Service.Fanv2 && Service.Fanv2.UUID
  ].filter(Boolean));

  accessory.services
    .filter(service => service && service.UUID !== Service.AccessoryInformation.UUID)
    .forEach(service => {
      const isManaged = managedSet.has(service.UUID);
      const isLegacy = legacyServiceUUIDs.has(service.UUID);

      if (isLegacy && !isManaged) {
        if (logger && typeof logger.info === 'function') {
          logger.info('Removing legacy service %s (%s)', service.displayName, service.UUID);
        }
        accessory.removeService(service);
      }
    });
}

/**
 * Registers a service as managed for an accessory.
 * Managed services are tracked in the accessory context and won't be pruned.
 *
 * @param {object} accessory - The HomeKit accessory
 * @param {object} service - The service to register
 */
function registerManagedService(accessory, service) {
  if (!accessory || !service) {
    return;
  }
  if (!Array.isArray(accessory.context.managedServiceUUIDs)) {
    accessory.context.managedServiceUUIDs = [];
  }
  if (!accessory.context.managedServiceUUIDs.includes(service.UUID)) {
    accessory.context.managedServiceUUIDs.push(service.UUID);
  }
}

/**
 * Unregisters a service from the managed list for an accessory.
 * After unregistering, the service may be pruned on next cleanup.
 *
 * @param {object} accessory - The HomeKit accessory
 * @param {object} service - The service to unregister
 */
function unregisterManagedService(accessory, service) {
  if (!accessory || !service || !Array.isArray(accessory.context.managedServiceUUIDs)) {
    return;
  }
  accessory.context.managedServiceUUIDs = accessory.context.managedServiceUUIDs
    .filter(uuid => uuid !== service.UUID);
}

module.exports = {
  pruneUnsupportedServices,
  registerManagedService,
  unregisterManagedService
};
