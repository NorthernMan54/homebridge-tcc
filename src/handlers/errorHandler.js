'use strict';

/**
 * Error Handler Utilities
 *
 * Centralized error handling for characteristic callbacks.
 */

/**
 * Handles errors that occur during accessory state refresh operations.
 * Ensures errors are properly formatted as Error objects before passing to callback.
 *
 * @param {Function} callback - The HomeKit characteristic callback
 * @param {Error|string} error - The error to handle
 */
function handleRefreshError(callback, error) {
  callback(error instanceof Error ? error : new Error(error));
}

module.exports = {
  handleRefreshError
};
