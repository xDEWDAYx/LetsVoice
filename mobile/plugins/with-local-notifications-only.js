const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * expo-notifications supports both local and remote notifications and adds the
 * APNs entitlement by default. LetsVoice schedules local notifications only,
 * so keep the generated iOS target compatible with Personal Team signing.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (configWithEntitlements) => {
    delete configWithEntitlements.modResults["aps-environment"];
    return configWithEntitlements;
  });
};
